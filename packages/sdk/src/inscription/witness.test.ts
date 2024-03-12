import * as bitcoin from "bitcoinjs-lib";
import { buildWitnessScript, WitnessScriptOptions } from './witness';

describe('buildWitnessScript', () => {
  test('throws error when required options are missing', () => {
    const options: Partial<WitnessScriptOptions> = {};

    expect(() => buildWitnessScript(options as WitnessScriptOptions)).toThrow();
  });

  test('includes empty fields in the script', () => {
    const options: WitnessScriptOptions = {
      xkey: 'somehexkey',
    };

    const script = buildWitnessScript(options);
    const decompiled = bitcoin.script.decompile(script);
    expect(decompiled).toBeTruthy()
  });

  test('includes delegate field in the script', () => {
    const options: WitnessScriptOptions = {
      xkey: 'somehexkey',
      delegate: {
        txid: '17541f6adf6eb160d52bc6eb0a3546c7c1d2adfe607b1a3cddc72cc0619526ad',
        index: 0
      },
    };

    const script = buildWitnessScript(options);
    const decompiled = bitcoin.script.decompile(script);
    expect(decompiled).toBeTruthy()
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
    const decompiled = bitcoin.script.decompile(script);
    expect(decompiled).toBeTruthy()
  });

});
