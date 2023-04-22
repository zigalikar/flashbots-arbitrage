// import { providers } from "ethers";
// import { IArbitrageWatchlistItem } from "../model/arbitrage-watchlist-item";
// import { Sushiswap } from "../model/markets/sushiswap";
// import { Uniswap } from "../model/markets/uniswap";
// import { UNISWAP_LIKE_PAIR_ABI } from "./abi";

import * as _ from 'lodash';

import { Contract, logger, providers } from "ethers";
import { IArbitrageWatchlistItem } from "../model/arbitrage-watchlist-item";
import { Market } from "../model/market";
import { Uniswap } from "../model/markets/uniswap";
import { UNISWAP_LIKE_PAIR_ABI, UNISWAP_LIKE_QUERY_ABI } from "./abi";
import { FACTORY_ADDRESSES, UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, WETH_ADDRESS } from "./address";
import { Logging } from '../helpers/logging';

// export function getArbitrageWatchlist(provider: providers.Provider): IArbitrageWatchlistItem[] {
//     return [
//         {
//             name: 'ETH/ID',
//             markets: [
//                 new Uniswap(provider, '0xBCFFa1619aB3cE350480AE0507408A3C6c3572Bd', UNISWAP_LIKE_PAIR_ABI, 0.003),
//                 new Sushiswap(provider, '0x77337ff10206480739a768124a18f3aa8c089153', UNISWAP_LIKE_PAIR_ABI, 0.003)
//             ]
//         },
//         {
//             name: 'YFI/ETH',
//             markets: [
//                 new Uniswap(provider, '0x2fdbadf3c4d5a8666bc06645b8358ab803996e28', UNISWAP_LIKE_PAIR_ABI, 0.003),
//                 new Sushiswap(provider, '0x088ee5007c98a9677165d78dd2109ae4a3d04d0c', UNISWAP_LIKE_PAIR_ABI, 0.003)
//             ]
//         },
//         {
//             name: 'UMA/ETH',
//             markets: [
//                 new Uniswap(provider, '0x88d97d199b9ed37c29d846d00d443de980832a22', UNISWAP_LIKE_PAIR_ABI, 0.003),
//                 new Sushiswap(provider, '0x001b6450083e531a5a7bf310bd2c1af4247e23d4', UNISWAP_LIKE_PAIR_ABI, 0.003)
//             ]
//         },
//         {
//             name: 'REN/ETH',
//             markets: [
//                 new Uniswap(provider, '0x8bd1661da98ebdd3bd080f0be4e6d9be8ce9858c', UNISWAP_LIKE_PAIR_ABI, 0.003),
//                 new Sushiswap(provider, '0x611cde65dea90918c0078ac0400a72b0d25b9bb1', UNISWAP_LIKE_PAIR_ABI, 0.003)
//             ]
//         }
//     ];
// }