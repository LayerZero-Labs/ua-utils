import { ethers } from 'ethers'
import { backOff } from 'exponential-backoff'
import { writeFile } from 'fs/promises'
import {
    ActionType,
    HardhatRuntimeEnvironment,
    TaskArguments
} from 'hardhat/types'
import {
    getProvider,
    getLayerZeroChainId,
    getEndpointAddress,
    getContractAt,
    getApplicationConfig,
    getDeploymentAddress,
} from './utils/crossChainHelper'
import { ENDPOINT_ABI, MESSAGING_LIBRARY_ABI } from './constants/abi'

/**
 * Arguments to generate default config for the mesh of networks.
 */
interface GenerateDefaultConfigTaskArgs {
    /**
     * Comma separated list of networks.
     */
    networks: string

    /**
     * The name of the deployed UserApplication.
     */
    name?: string

    /**
     * The path to the output file.
     */
    outputFileName: string

    /**
     * The checkConnection function fragment.  The contract function should be of the form:
     *
     * <code>function trustedRemoteLookup(uint16) public view returns (bytes)</code>
     *
     * The only part that may change is the function name.
     */
    checkConnectionFunctionFragment: string
}

/**
 * Remote config for a chain path.
 */
interface RemoteConfig {
    /**
     * Remote network name.
     */
    remoteChain: string,

    /**
     * The default inbound proof library version for the chain path.
     */
    inboundProofLibraryVersion: number,

    /**
     * The default inbound block confirmations for the chain path.
     */
    inboundBlockConfirmations: number,

    /**
     * The default relayer for the chain path.
     */
    relayer: string,

    /**
     * The default outbound proof type for the chain path.
     */
    outboundProofType: number,

    /**
     * The default outbound block confirmations for the chain path.
     */
    outboundBlockConfirmations: number,

    /**
     * The default oracle for the chain path.
     */
    oracle: string,
}

/**
 * Config for a chain path.
 */
interface ChainPathConfig {
    /**
     * Local network name.
     */
    name?: string,

    /**
     * The local network contract address.
     */
    address?: string,

    /**
     * The default send library version for the local network.
     */
    sendVersion: number,

    /**
     * The default receive library version for the local network.
     */
    receiveVersion: number,

    /**
     * The default remote configs for the local network.
     */
    remoteConfigs: RemoteConfig[]
}

/**
 * Default config settings for the LayerZero network mesh.  Note: the network is directional.
 */
interface DefaultConfigMesh {
    [network: string]: ChainPathConfig
}

/**
 * Input contracts configuration.
 */
type ContractConfigs = {
    [network: string]: {
        address: string,
    }
}

/**
 * Gets the remote config for a chain path.
 * @param {string} remoteNetwork the remote network name
 * @param {ethers.Contract} sendLibrary the local send library contract
 * @param {ethers.Contract} receiveLibrary the local receive library contract
 * @param {string} contractAddress the contract address
 */
const getRemoteConfig = async(remoteNetwork: string, sendLibrary: ethers.Contract, receiveLibrary: ethers.Contract, contractAddress: string) => {
    const appConfig = await backOff(async () => getApplicationConfig(remoteNetwork, sendLibrary, receiveLibrary, contractAddress))
    // TODO memoize
    const defaultAppConfig = await backOff(async () => sendLibrary.defaultAppConfig(getLayerZeroChainId(remoteNetwork)))

    // If the appConfig is the default (0, AddressZero, etc.), then use the defaultAppConfig.
    return {
        remoteChain: remoteNetwork,
        inboundProofLibraryVersion: appConfig.inboundProofLibraryVersion > 0 ? appConfig.inboundProofLibraryVersion : defaultAppConfig.inboundProofLibraryVersion,
        inboundBlockConfirmations: appConfig.inboundBlockConfirmations > 0 ? appConfig.inboundBlockConfirmations : defaultAppConfig.inboundBlockConfirmations.toNumber(),
        relayer: appConfig.relayer != ethers.constants.AddressZero ? appConfig.relayer : defaultAppConfig.relayer,
        outboundProofType: appConfig.outboundProofType > 0 ? appConfig.outboundProofType : defaultAppConfig.outboundProofType,
        outboundBlockConfirmations: appConfig.outboundBlockConfirmations > 0 ? appConfig.outboundBlockConfirmations : defaultAppConfig.outboundBlockConfirmations.toNumber(),
        oracle: appConfig.oracle != ethers.constants.AddressZero ? appConfig.oracle : defaultAppConfig.oracle,
    }
}

/**
 * Gets the remote configs for a list of chain paths.
 * @param {HardhatRuntimeEnvironment} hre the hardhat runtime environment
 * @param {string} network the local network name
 * @param {string} contractAddress the contract address
 * @param {string[]} remoteNetworks the remote network names
 * @param {ethers.Contract} sendLibrary the local send library contract
 * @param {ethers.Contract} receiveLibrary the local receive library contract
 * @param {string} checkConnectionFunctionFragment the checkConnection function fragment
 */
const getRemoteConfigs = async (
    hre: HardhatRuntimeEnvironment,
    network: string,
    contractAddress: string,
    remoteNetworks: string[],
    sendLibrary: ethers.Contract,
    receiveLibrary: ethers.Contract,
    checkConnectionFunctionFragment: string
): Promise<RemoteConfig[]> => {
    const connectedRemoteNetworks = await Promise.all(
        remoteNetworks.filter(async (remoteNetwork: string) => isConnected(hre, network, contractAddress, remoteNetwork, checkConnectionFunctionFragment)))
    return Promise.all(connectedRemoteNetworks.map(async (remoteNetwork: string) => getRemoteConfig(remoteNetwork, sendLibrary, receiveLibrary, contractAddress)))
}

/**
 * Checks if a contract is connected to a remote network using checkConnectionFunctionFragment.
 * @param {HardhatRuntimeEnvironment} hre the hardhat runtime environment
 * @param {string} network the local network name
 * @param {string} contractAddress the contract address
 * @param {string} remoteNetwork the remote network name
 * @param {string} checkConnectionFunctionFragment the checkConnection function fragment
 */
const isConnected = async (
    hre: HardhatRuntimeEnvironment,
    network: string,
    contractAddress: string,
    remoteNetwork: string,
    checkConnectionFunctionFragment: string
): Promise<boolean> => {
    const abi = [checkConnectionFunctionFragment]
    const remoteChainId = getLayerZeroChainId(remoteNetwork)
    const key = checkConnectionFunctionFragment.split(' ')[1]
    const app = await getContractAt(hre, network, abi, contractAddress)
    const val = await backOff(async () => app[key](remoteChainId))
    return val.length > 0
}

/**
 * Get send/receive versions and Contracts.
 * @param {ethers.Contract} endpoint the endpoint contract
 * @param {string} contractAddress the contract address
 * @param {ethers.providers.JsonRpcProvider} provider the provider
 */
const getVersions = async(
    endpoint: ethers.Contract,
    contractAddress: string,
    provider: ethers.providers.JsonRpcProvider
): Promise<{
    sendVersion: number,
    receiveVersion: number,
    sendLibrary: ethers.Contract,
    receiveLibrary: ethers.Contract,
}> => {
    const {
        sendVersion: uaSendVersion,
        receiveVersion: uaReceiveVersion,
        sendLibrary: uaSendLibraryAddress,
        receiveLibraryAddress: uaReceiveLibraryAddress
    } = await endpoint.uaConfigLookup(contractAddress)

    let sendLibraryAddress: string, sendVersion: number
    if (uaSendVersion === 0) {
        sendLibraryAddress = await endpoint.defaultSendLibrary()
        sendVersion = await endpoint.defaultSendVersion()
    } else {
        sendLibraryAddress = uaSendLibraryAddress
        sendVersion = uaSendVersion
    }
    const sendLibrary = new ethers.Contract(sendLibraryAddress, MESSAGING_LIBRARY_ABI, provider)

    let receiveLibraryAddress: string, receiveVersion: number
    if (uaReceiveVersion === 0) {
        receiveLibraryAddress = await endpoint.defaultReceiveLibraryAddress()
        receiveVersion = await endpoint.defaultReceiveVersion()
    } else {
        receiveLibraryAddress = uaReceiveLibraryAddress
        receiveVersion = uaReceiveVersion
    }
    const receiveLibrary = new ethers.Contract(receiveLibraryAddress, MESSAGING_LIBRARY_ABI, provider)

    return {
        sendVersion,
        receiveVersion,
        sendLibrary,
        receiveLibrary,
    }
}

/**
 * Gets the default config for the mesh of networks.
 * @param {HardhatRuntimeEnvironment} hre the hardhat runtime environment
 * @param {ContractConfigs} configs the contract configs
 * @param {string} checkConnectionFunctionFragment the checkConnection function fragment
 * @param {string} name the name of the deployed UserApplication
 */
const generateAppConfig = async (
    hre: HardhatRuntimeEnvironment,
    configs: ContractConfigs,
    checkConnectionFunctionFragment: string,
    name?: string,
): Promise<DefaultConfigMesh> => {
    const networks = Object.keys(configs)
    return (networks.reduce(async (acc, network: string) => {
        const provider = getProvider(hre, network)
        const endpointAddress = getEndpointAddress(network)
        const endpoint = new ethers.Contract(endpointAddress, ENDPOINT_ABI, provider)
        const address = configs[network].address
        const { sendVersion, sendLibrary, receiveVersion, receiveLibrary } = await getVersions(endpoint, address, provider)
        const remoteConfigs = await getRemoteConfigs(hre, network, address, networks, sendLibrary, receiveLibrary, checkConnectionFunctionFragment)
        return {
            ...await acc,
            [network]: {
                ...(name && { name }),
                sendVersion,
                receiveVersion,
                address,
                remoteConfigs,
            }
        }
    }, Promise.resolve({})))
}

//--------------------------------------------------------------------------------------------//
//----------------------------------- HardHat Task Related -----------------------------------//
//--------------------------------------------------------------------------------------------//

const getContractConfigs = (inputNetworks: string, name?: string): ContractConfigs => {
    return inputNetworks.split(",").reduce((acc, inputNetwork) => {
        const [key,value] = inputNetwork.split(":")
        return {
            ...acc,
            [key]: {
                address: value ? value : getDeploymentAddress(key, name!),
            }
        }
    }, {})
}

/**
 * Sanity check the output file name format.
 * @param {string} fileName
 */
const checkOutputFileName = (fileName: string): void => {
    if (!fileName) {
        throw new Error("Output file name is required.")
    }
    if (!fileName.endsWith(".json")) {
        throw new Error("Output file name must end with .json.")
    }
    if (fileName.startsWith("/")) {
        throw new Error("Output file name must be relative.")
    }
}

/**
 * Action to generate the default config for the mesh of networks.
 * @param {GenerateDefaultConfigTaskArgs} taskArgs the task arguments
 * @param {HardhatRuntimeEnvironment} hre
 */
export const generateAppConfigAction: ActionType<TaskArguments> = async (
    taskArgs: GenerateDefaultConfigTaskArgs,
    hre: HardhatRuntimeEnvironment
): Promise<void> => {
    const { networks: inputNetworks, name, outputFileName, checkConnectionFunctionFragment } = taskArgs
    const configs = getContractConfigs(inputNetworks, name)
    checkOutputFileName(outputFileName)
    const defaultConfigMesh = await generateAppConfig(hre, configs, checkConnectionFunctionFragment, name)
    await writeFile(outputFileName, JSON.stringify(defaultConfigMesh, null, 2))
}