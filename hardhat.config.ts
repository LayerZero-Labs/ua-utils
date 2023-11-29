import { HardhatUserConfig } from "hardhat/config";

import "./src/index"

// This adds support for typescript paths mappings
import "tsconfig-paths/register";

const config: HardhatUserConfig = {
    networks: {
        'sepolia-testnet': {
            url: 'https://eth-sepolia.public.blastapi.io'
        },
        'bsc-testnet': {
            url: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
        },
        'avalanche-testnet': {
            url: 'https://ava-testnet.public.blastapi.io/ext/bc/C/rpc'
        },
        'idex-testnet': {
            url: 'https://rpc-devnet-idex.hardfork.dev'
        },


        'ethereum-mainnet': {
            url: 'https://eth.llamarpc.com'
        },
        'bsc-mainnet': {
            url: 'https://binance.llamarpc.com'
        },
        'avalanche-mainnet': {
            url: 'https://api.avax.network/ext/bc/C/rpc'
        },
        'polygon-mainnet': {
            url: 'https://polygon.llamarpc.com'
        },
        'arbitrum-mainnet': {
            url: 'https://arbitrum.llamarpc.com'
        },
        'optimism-mainnet': {
            url: 'https://mainnet.optimism.io'
        },
        'fantom-mainnet': {
            url: 'https://fantom-mainnet.public.blastapi.io'
        },
        'base-mainnet': {
            url: 'https://base.llamarpc.com'
        },
        'kava-mainnet': {
            url: 'https://kava-evm.publicnode.com'
        },
        'mantle-mainnet': {
            url: 'https://1rpc.io/mantle'
        },
        'metis-mainnet': {
            url: 'https://metis-mainnet.public.blastapi.io'
        },
        'scroll-mainnet': {
            url: 'https://rpc.scroll.io'
        },
        'zkconsensys-mainnet': {
            url: 'https://1rpc.io/linea'
        }
    }
};

export default config;