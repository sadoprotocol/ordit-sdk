import * as ecc from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";

export function buildWitnessScript(options: WitnessScriptOptions) {
  bitcoin.initEccLib(ecc);
  if (!options.mediaType || !options.mediaContent || !options.xkey) {
    throw new Error("Failed to build witness script");
  }

  const contentChunks = chunkContent(options.mediaContent);

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

  const baseStackElements = [
    Buffer.from(options.xkey, "hex"),
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    opPush("ord"),
    1,
    1,
    opPush(options.mediaType),
    bitcoin.opcodes.OP_0
  ];

  const contentStackElements: (number | Buffer)[] = [];

  if (contentChunks) {
    contentChunks.forEach((chunk) => {
      let encoding: BufferEncoding = "utf8";
      if (options.mediaType.indexOf("text") < 0) {
        encoding = "base64";
      }
      contentStackElements.push(opPush(chunk, encoding));
    });
  }

  try {
    const witness = bitcoin.script.compile([
      ...baseStackElements,
      ...contentStackElements,
      bitcoin.opcodes.OP_ENDIF,
      ...metaStackElements
    ]);

    return witness;
  } catch (error) {
    //fail silently
  }

  return false;
}

function opPush(str: string, encoding: BufferEncoding = "utf8") {
  const buff = Buffer.from(str, encoding);
  const obj = [buff];
  const push = Buffer.concat(obj);
  return push;
}

const chunkContent = function (str: string) {
  const chunkList = str.match(/.{1,520}/g);
  return chunkList;
};

export type WitnessScriptOptions = {
  xkey: string;
  mediaContent: string;
  mediaType: string;
  meta: any;
};
