import { ordit } from "@sadoprotocol/ordit-sdk"; //import Ordit

async function main() {
  // Replace accordingly
  const psbtTemplate = {
    satsPerByte: 1,
    format: "p2wpkh",
    network: "testnet",
    pubKey: "02950611fedb407d34cc845101f2bdfb2e7e3ec075e1424015bbf2db75c8ebe696",
    ins: [
      {
        address: "tb1qzxtxwhsqkh0yp6ne0mpefu99gn49a945m9hc28"
      }
    ],
    outs: [
      {
        address: "tb1qzxtxwhsqkh0yp6ne0mpefu99gn49a945m9hc28",
        cardinals: 1337
      }
    ]
  };

  // You need to sign this externally (tip: try window.unisat.signPsbt)
  const psbt = await ordit.transactions.createPsbt(psbtTemplate);
  console.log(psbt);

  const hex = "your signed PSBT hex here";
  const txId = await ordit.transactions.relayTransaction(hex, "testnet");
  console.log(txId);
}

main();
