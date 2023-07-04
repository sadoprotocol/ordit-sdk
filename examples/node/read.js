import { Ordit } from "@sadoprotocol/ordit-sdk";

const OUTPOINT =
  "105758bb912665f5f803ec0f5268d2218b51978b16de05622c64c9faafd2d22e:0";

const inscription = await Ordit.inscription.getInscriptionDetails(
  OUTPOINT,
  "mainnet"
);
console.log(JSON.stringify(inscription, null, 2)); //pretty print with spaces
