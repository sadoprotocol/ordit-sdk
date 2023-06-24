import * as ecc from "@bitcoinerlab/secp256k1";
import bitcoin from "bitcoinjs-lib";

export function buildWitnessScript(options: WitnessScriptOptions) {
  bitcoin.initEccLib(ecc);
  if (!options.mediaType || !options.mediaContent || !options.xkey) {
    throw new Error("Failed to build witness script");
  }

  const metaStackElements =
    typeof options.meta === "object"
      ? [
          bitcoin.opcodes.OP_FALSE,
          bitcoin.opcodes.OP_IF,
          opPush("ord"),
          1,
          1,
          opPush("application/json;charset=utf-8"),
          bitcoin.opcodes.OP_0,
          opPush(JSON.stringify(options.meta)),
          bitcoin.opcodes.OP_ENDIF
        ]
      : [];

  try {
    const witness = bitcoin.script.compile([
      Buffer.from(options.xkey, "hex"),
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_FALSE,
      bitcoin.opcodes.OP_IF,
      opPush("ord"),
      1,
      1,
      opPush(options.mediaType),
      bitcoin.opcodes.OP_0,
      opPush(options.mediaContent),
      bitcoin.opcodes.OP_ENDIF,
      ...metaStackElements
    ]);

    return witness;
  } catch (error) {
    //fail silently
  }

  return false;
}

function opPush(str: string) {
  const buff = Buffer.from(str, "utf8");
  const obj = [buff];
  const push = Buffer.concat(obj);
  return push;
}

export type WitnessScriptOptions = {
  xkey: string;
  mediaContent: string;
  mediaType: string;
  meta: any;
};
