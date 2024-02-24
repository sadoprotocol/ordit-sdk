import * as bitcoin from "bitcoinjs-lib";
import { buildWitnessScript, WitnessScriptOptions } from './witness';

describe('buildWitnessScript', () => {
  test('throws error when required options are missing', () => {
    const options: Partial<WitnessScriptOptions> = {};

    expect(() => buildWitnessScript(options as WitnessScriptOptions)).toThrow();
  });

  test('returns a script with OP_CHECKSIG for recovery', () => {
    const options: WitnessScriptOptions = {
      xkey: 'somehexkey',
      mediaType: 'text/plain',
      mediaContent: 'Hello, world!',
      recover: true,
    };

    const script = buildWitnessScript(options);
    expect(script).toEqual(bitcoin.script.compile([
      Buffer.from(options.xkey, "hex"),
      bitcoin.opcodes.OP_CHECKSIG
    ]));
  });

  test('includes all provided fields in the script', () => {
    const options: WitnessScriptOptions = {
      xkey: 'somehexkey',
      mediaType: 'text/plain',
      mediaContent: 'Hello, world!',
      meta: { some: 'metadata' },
      pointer: 123,
      parent: {
        txid: '3bd72a7ef68776c9429961e43043ff65efa7fb2d8bb407386a9e3b19f149bc36',
        index: 0
      },
      metaprotocol: 'metaprotocol-data',
      contentEncoding: 'utf-8',
      delegate: {
        txid: '17541f6adf6eb160d52bc6eb0a3546c7c1d2adfe607b1a3cddc72cc0619526ad',
        index: 0
      },
    };

    const script = buildWitnessScript(options);
    const expectedScript = '00ac0063036f726402040000007b032036bc49f1193b9e6a3807b48b2dfba7ef65ff4330e4619942c97687f67e2ad73b050fa164736f6d65686d6574616461746107116d65746170726f746f636f6c2d6461746109057574662d380b20ad269561c02cc7dd3c1a7b60feadd2c1c746350aebc62bd560b16edf6a1f5417010a746578742f706c61696e000d48656c6c6f2c20776f726c642168';
    expect(script.toString('hex')).toBe(expectedScript);
  });
});
