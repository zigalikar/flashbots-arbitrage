import { BigNumber } from 'ethers';
import { BigNumber as BN } from 'bignumber.js';

export class BigNumberUtils {
    public static sqrt(value: BigNumber): BigNumber {
        const bn = new BN(value.toString());
        const sqrt = bn.squareRoot();
        return BigNumber.from(sqrt.toFixed(0));

        // const ONE = BigNumber.from(1);
        // const TWO = BigNumber.from(2);

        // let z = value.add(ONE).div(TWO);
        // let y = value;
        // while (z.sub(y).isNegative()) {
        //     y = z;
        //     z = value.div(z).add(z).div(TWO);
        // }
        
        // return y;
    }
}