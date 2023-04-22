import * as dotenv from 'dotenv';
import * as path from 'path';

import { Logging } from "./helpers/logging";
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { Contract, providers, Wallet } from "ethers";
import { Market } from "./model/market";
import { Markets } from "./helpers/markets";
import { Arbitrage } from "./model/arbitrage";
import { ERC20_ABI, EXECUTOR_CONTRACT_ABI } from "./utils/abi";
import { WETH_ADDRESS } from './utils/address';

// logger
const indexLogger = Logging.getLogger('index.ts');

let env = process.env.NODE_ENV;
if (env == undefined) {
    indexLogger.warn('No environment provided. Use the \'NODE_ENV\' environment variable. Using default dev environment.')
    env = 'dev';
}

const output = dotenv.config({ path: path.resolve(process.cwd(), `./environments/${env.toString()}.env`) });
if (output.error)
    indexLogger.error('Failed to parse environment variables from file.', output.error);

// Ethereum RPC URL (default through infura)
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/31c6ae15ce51478f88272553e467e9b2';
if (ETHEREUM_RPC_URL == undefined)
    indexLogger.warn('No \'ETHEREUM_RPC_URL\' provided. Using default infura RPC URL.');

const provider = new providers.StaticJsonRpcProvider(ETHEREUM_RPC_URL);

// executor contract that executes the arbitrage on-chain and pays the miner
const EXECUTOR_CONTRACT_ADDRESS = process.env.EXECUTOR_CONTRACT_ADDRESS || '0xa6A36ACD5cEEE890F5106f5c7C75db4dA834E0C2';
if (EXECUTOR_CONTRACT_ADDRESS == undefined) {
    indexLogger.error('No \'EXECUTOR_CONTRACT_ADDRESS\' provided.')
    process.exit(1);
}

// Flashbots relay signing private key for setting up a reputation for whitelisting
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY;
if (FLASHBOTS_RELAY_SIGNING_KEY == undefined) {
    indexLogger.error("No \'FLASHBOTS_RELAY_SIGNING_KEY\' provided.");
    process.exit(1);
}

// private key to the wallet executing arbitrage
const ARBITRAGE_SIGNING_KEY = process.env.ARBITRAGE_SIGNING_KEY;
if (ARBITRAGE_SIGNING_KEY == undefined) {
    indexLogger.error("No \'ARBITRAGE_SIGNING_KEY\' provided.");
    process.exit(1);
}

const MINER_REWARD_PERCENTAGE = Number.parseInt(process.env.MINER_REWARD_PERCENTAGE) || 20;

const executorContract = new Contract(EXECUTOR_CONTRACT_ADDRESS, EXECUTOR_CONTRACT_ABI, provider);
const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY, provider);
const arbitrageSigningWallet = new Wallet(ARBITRAGE_SIGNING_KEY, provider);

async function main() {
    const logger = Logging.getLogger('main');
    logger.info(`Starting bot
        \tETHEREUM_RPC_URL: ${ETHEREUM_RPC_URL}
        \tEXECUTOR_CONTRACT_ADDRESS: ${EXECUTOR_CONTRACT_ADDRESS}
        \tFLASHBOTS_RELAY_SIGNING_KEY address: ${flashbotsRelaySigningWallet.address}
        \tARBITRAGE_SIGNING_KEY address: ${arbitrageSigningWallet.address}`);

    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet);

    // get list of markets to arbitrage
    // const watchlist = getArbitrageWatchlist(provider);
    const marketsToArb = await Markets.getArbitrageWatchlist(provider);

    // flatten
    let marketsToArbFlat: Market[] = [];
    marketsToArb.forEach(m => marketsToArbFlat = marketsToArbFlat.concat(m.markets));

    if (marketsToArb.length === 0) {
        logger.error('No markets to arbitrage found.');
        process.exit(1);
    }
    else
        logger.info(`Started watching ${marketsToArb.length} markets for arbitrage.`);
    
    const WETH = new Contract(WETH_ADDRESS, ERC20_ABI, provider);
    const arbitrage = new Arbitrage(flashbotsProvider, executorContract, arbitrageSigningWallet, MINER_REWARD_PERCENTAGE);
    provider.on('block', async blockNumber => {
        logger.info('New block nr.: ' + blockNumber);

        // TODO: get balance of actual quote token, not WETH
        const balanceWeth = await WETH.balanceOf(executorContract.address);
        
        // TODO: cancellation token
        Markets.updateReserves(provider, marketsToArbFlat)
            .then(async () => {
                // logger.info('Updated reserves.');
                // evaluate each group of markets
                for (let i = 0; i < marketsToArb.length; i++) {
                    const item = marketsToArb[i];
                    try {
                        const arb = await arbitrage.getBestArbitrage(item, balanceWeth);
                        if (arb) {
                            // logger.info(`Found arbitrage opportunity for ${item.name}: buy ${arb.buyMarket.address} (amount ${arb.amountQuote} [quote]), sell ${arb.sellMarket.address}, estimated profit (quote): ${arb.estimatedProfitQuote}`);
                            arbitrage.take(arb, blockNumber)
                                .then(e => logger.info(`Dispatched arbitrage transaction [${e.id}].`))
                                .catch(e => logger.error(e));
                        }
                    }
                    catch (e) {
                        logger.error('Error when evaluating markets for arbitrage.', e);
                    }
                }
                // logger.info('Evaluated all markets for arbitrage.');
            })
            .catch(e => logger.error('Error when updating market reserves.', e));
    });
}

main();
