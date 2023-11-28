import { readFileSync } from 'fs'

const GNOSIS_SAFE_FILE_ENCODING = 'utf-8'

/**
 * Gnosis Safe configuration for a specific network.
 */
type SafeConfig = {
    safeAddress: string
    url: string
    contractNetworks?: ContractNetworks
}

/**
 * Contract addresses for each network.
 */
type ContractNetworks = {
    [chainListId: string]: {
        multiSendAddress: string
        safeMasterCopyAddress: string
        safeProxyFactoryAddress: string
    }
}

/**
 * Converts a ContractNetworks object to a string.
 * @param {ContractNetworks} contractNetworks The ContractNetworks object to convert.
 */
export const toContractNetworksString = (contractNetworks?: ContractNetworks): string => {
    if (contractNetworks === undefined) {
        return ''
    }
    return Object.entries(contractNetworks).reduce((accumulator, [chainListId, config]) => {
        return accumulator + `contractNetworks[chainListId=${chainListId}, multiSendAddress=${config.multiSendAddress}, safeMasterCopyAddress=${config.safeMasterCopyAddress}, safeProxyFactoryAddress=${config.safeProxyFactoryAddress}]`;
    }, '');
}

/**
 * Gnosis Safe configuration per network.
 */
export interface SafeConfigs {
    [chainName: string]: SafeConfig
}

/**
 * Reads the safe config file and returns the parsed SafeConfigs.
 * @param {string} fileName The name of the safe config file.
 */
export const getSafeConfigs = (fileName: string): SafeConfigs => {
    return JSON.parse(readFileSync(fileName, GNOSIS_SAFE_FILE_ENCODING)) as SafeConfigs
}