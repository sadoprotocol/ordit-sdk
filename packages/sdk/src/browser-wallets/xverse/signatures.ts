import { Psbt } from "bitcoinjs-lib";
import {
  InputToSign,
  sendBtcTransaction,
  SendBtcTransactionOptions,
  signMessage as _signMessage,
  signTransaction
} from "sats-connect";

import { Network } from "../../config/types";
import { isXverseInstalled, XverseNetwork } from "./utils";

// Directly passing the function does not seem to work
// While the function object declared in the final build, it points to undefined
// export { sendBtcTransaction }
export async function sendBitcoin(options: SendBtcTransactionOptions) {
  if (!isXverseInstalled()) {
    throw new Error("Xverse not installed.");
  }

  try {
    await sendBtcTransaction(options);
  } catch (error: any) {
    throw new Error(error.message);
  }
}

export async function signPsbt(options: XverseSignPsbtOptions) {
  let result = null;

  if (!options.psbt || !options.network || !options.inputs) {
    throw new Error("Invalid options provided.");
  }

  if (!isXverseInstalled()) {
    throw new Error("Xverse not installed.");
  }

  const handleFinish = (response: XverseSignPsbtResponse) => {
    const { psbtBase64 } = response;

    if (!psbtBase64) {
      throw new Error("Failed to sign transaction using xVerse");
    }

    const signedPsbt = Psbt.fromBase64(psbtBase64);
    let rawTxHex = null;

    try {
      signedPsbt.finalizeAllInputs();
      rawTxHex = signedPsbt.extractTransaction().toHex();
    } catch (error) {
      result = {
        rawTxHex,
        psbt: {
          hex: signedPsbt.toHex(),
          base64: signedPsbt.toBase64()
        }
      };
    }

    result = {
      rawTxHex,
      psbt: {
        hex: signedPsbt.toHex(),
        base64: signedPsbt.toBase64()
      }
    };
  };

  const xverseOptions = {
    payload: {
      network: {
        type: (options.network.charAt(0).toUpperCase() + options.network.slice(1)) as XverseNetwork
      },
      message: "Sign Ordit SDK Transaction",
      psbtBase64: options.psbt.toBase64(),
      broadcast: false,
      inputsToSign: options.inputs
    },
    onFinish: handleFinish,
    onCancel: () => handleOnSignCancel("Psbt")
  };

  await signTransaction(xverseOptions);

  return result;
}

export async function signMessage(options: XverseSignMessageOptions) {
  let result = null;
  if (!options.message || !options.network || !options.address) {
    throw new Error("Invalid options provided.");
  }

  if (!isXverseInstalled()) {
    throw new Error("Xverse not installed.");
  }

  const handleFinish = (response: string) => {
    result = {
      signature: response
    };
  };

  const xverseOptions = {
    payload: {
      network: {
        type: (options.network.charAt(0).toUpperCase() + options.network.slice(1)) as XverseNetwork
      },
      message: options.message,
      broadcast: false,
      address: options.address
    },
    onFinish: handleFinish,
    onCancel: () => handleOnSignCancel("Message")
  };

  await _signMessage(xverseOptions);

  return result;
}

function handleOnSignCancel(value = "") {
  throw new Error(`Failed to sign ${value} using xVerse`);
}

export type XverseSignPsbtOptions = {
  psbt: Psbt;
  network: Network;
  inputs: InputToSign[];
};

export type XverseSignPsbtResponse = {
  psbtBase64: string;
};

export type XverseSignMessageOptions = {
  address: string;
  message: string;
  network: Network;
};
