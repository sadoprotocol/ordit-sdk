import * as addresses from "./addresses";
import * as api from "./api";
import * as config from "./config";
import * as inscription from "./inscription";
import * as keys from "./keys";
import * as signatures from "./signatures";
import * as utils from "./utils";
import * as wallet from "./wallet";

export const ordit = {
  config,
  api,
  addresses,
  wallet,
  keys,
  signatures,
  inscription,
  utils
};

export * from "./addresses";
export * from "./api";
export * from "./config";
export * from "./inscription";
export * from "./keys";
export * from "./signatures";
export * from "./utils";
export * from "./wallet";
