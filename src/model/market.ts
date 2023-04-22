import { BigNumber, Contract, ContractInterface, providers } from "ethers";

/**
 * Base model for markets
 */
export abstract class Market {
    protected readonly _provider: providers.Provider;
    protected readonly _abi: ContractInterface;
    protected readonly _contract: Contract;

    public readonly address: string;
    public readonly fee: number;

    public get token0Address(): string { return this._token0Address; }
    private _token0Address: string;

    public get token1Address(): string { return this._token1Address; }
    private _token1Address: string;

    /**
     * Reserves of base currency in the pool
     */
    public get token0Reserves(): BigNumber { return this._token0Reserves; }
    private _token0Reserves: BigNumber;

    /**
     * Reserves of quote currency in the pool
     */
    public get token1Reserves(): BigNumber { return this._token1Reserves; }
    private _token1Reserves: BigNumber;

    /**
     * Gets the swap data & targets
     * @param from What token to swap from (quote/base)
     * @param amount Amount to swap
     * @param recipient Address that receives the swapped tokens
     */
    public abstract swap(from: string, amount: BigNumber, recipient: string): Promise<string>;

    constructor(provider: providers.Provider, address: string, token0Address: string, token1Address: string, abi: ContractInterface, fee: number) {
        this._provider = provider;
        this._abi = abi;
        this._contract = new Contract(address, abi, provider);
        this.address = address;
        this._token0Address = token0Address;
        this._token1Address = token1Address;
        this.fee = fee;
    }

    // /**
    //  * Calculate what the reserves have to change to in order for the market to set the price to the specified
    //  * @param price Price to calculate the reserves for
    //  */
    // public getNewReservesForPrice(price: number): { base: BigNumber, quote: BigNumber } {
    //     const k = this.quoteReserves.mul(this.baseReserves);
    //     const newBase = Math.sqrt(k.toNumber() / price);
    //     const newQuote = price * newBase;
    //     return { base: BigNumber.from(newBase), quote: BigNumber.from(newQuote) };
    // }

    /**
     * Calculates the amount of tokens received when swapping to token 0 from token 1
     * @param token1In Input of token 1
     * @returns Output of token 0
     */
    public getTokens0Out(token1In: BigNumber): BigNumber { return this._getTokensOut(this.token1Reserves, this.token0Reserves, token1In); }

    /**
     * Calculates the amount of tokens received when swapping to token 1 from token 0
     * @param token0In Input of token 0
     * @returns Output of token 1
     */
    public getTokens1Out(token0In: BigNumber): BigNumber { return this._getTokensOut(this._token0Reserves, this.token1Reserves, token0In); }

    /**
     * Calculates the amount of tokens received when swapping
     * @param from Address of token swapping from
     * @param to Address of token swapping to
     * @param amountIn Amount of token swapping from
     * @returns Amount of token swapping to
     */
    public getTokensOut(from: string, to: string, amountIn: BigNumber): BigNumber {
        if ((from !== this.token0Address && from !== this.token1Address) || (to !== this.token0Address && to !== this.token1Address))
            return BigNumber.from(0); // no token in this market pair
        
        const reserveIn = from === this.token0Address ? this.token0Reserves : this.token1Reserves;
        const reserveOut = to === this.token0Address ? this.token1Reserves : this.token0Reserves;

        const amountInWithFee: BigNumber = amountIn.mul(997);
        const numerator = amountInWithFee.mul(reserveOut);
        const denominator = reserveIn.mul(1000).add(amountInWithFee);
        return numerator.div(denominator);
    }

    private _getTokensOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber): BigNumber {
        const amountInWithFee: BigNumber = amountIn.mul(997);
        const numerator = amountInWithFee.mul(reserveOut);
        const denominator = reserveIn.mul(1000).add(amountInWithFee);
        return numerator.div(denominator);
    }

    /**
     * Updates the reserves data of the market
     * @param token0Reserves Token 0 reserves of the market
     * @param token1Reserves Token 1 reserves of the market
     */
    protected setReserves(token0Reserves: BigNumber, token1Reserves: BigNumber) {
        this._token0Reserves = token0Reserves;
        this._token1Reserves = token1Reserves;
    }
}
