import { Ordit } from "@sadoprotocol/ordit-sdk"

const MNEMONIC = "caution curtain there off know kit market gather slim april dutch sister"

async function main() {
  // init wallet
  const wallet = new Ordit({
    bip39: MNEMONIC,
    network: "testnet"
  });

  wallet.setDefaultAddress('taproot')

  // new inscription tx
  const transaction = Ordit.inscription.new({
    network: "testnet",
    publicKey: wallet.publicKey,
    changeAddress: wallet.selectedAddress,
    destination: wallet.selectedAddress,
    mediaContent: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGElEQVR4nO2by04UQRSGvw34CjoGDAQ3XhDXRnTBAiG4ExMn8QlMmHh5ghE2OOMTsOPmgkSJuhiIuNCVvgFGRia6YFxoNPEGjClyOjlpZyKMU101dn1Jp5Pups7pw+mqv07VQCAQCARaTg9wDcgDc8AjYEXOc3I9C/TyH3EamAbKQO0Ah3n+HtBPmzIIlBq83DawAbwGXsp5Q67Xe74k7bUFR4CF2AvsAGtADjgLdDb42065n5Pnd2LtLAIZPOYSsKUc/grcB4412V43UAS+qDarwAgechPYVY4utPC/ZdqZV20bO7fwiLxy7jNw1ZKdcWk/sjWFB9xQDn0Azli2dwLYVDbv4Pib3xVH3ss4nwSmT6moz2EUR739lkr7UwnbP6k+h6qL0WFRpaFRby64EhsiE2Mw1tu7RI8OF5MyWlLjvGthclT8MP6sJqXta3IYkeIDReXTgG1j00reNqvwWk23ks0F28bKYshodZ94Jn69s2mkR6WambD4RE751mfLSFYZMbM2nxhQvl23rfm3gUP4RQfwU/y7a8vIrBh4i5+8Ef+MNrDCshgwFRwfeSX+PbYtgF7gJ8/FPzMiWGE57Rkwm/Y+IK9GgUaFTR9GgUlbRrJp1wG9baIEj9s0VE7zXCA+GzSzMB/oUrNBsw5hlX6VatannvukkGQ9wLeKUEZVhBL7LC+oiFsbc5uoCZ53VRUex31VeMlF6lXVuoCp0yeJWSH6JPY/AodxwIhaGaokWCPsUstjpvcfwyG3VRpWEsiE+NrgDB4wFVsdHrf4zUdpHx3fXa0N1ssEvT9gvsX7A+ZiO05m5OW9CsKo6hgjnVD8B8XYJSInGuejDm9M2fMuCBngQYM9QhOyf8BMXevRIfcnRNvH9wgt1entvQxCJJZWG+z6+gWsS2VpRc7rcr3e82t/ETneBgHR5gWZpdUOcGzKxGa/2t7rIET0SbFiUjrJJ5IBT6WTm5T7zc7n2yIIthkGvkkQfgCXSSHDIQiEIBhCJhCCsEfIBEIQ9giZwJ9iaYiUB+EhKWVIfqx1zrUjgUAggG/8BsfNc0SX+zvYAAAAAElFTkSuQmCC',
    mediaType: "image/png",
    feeRate: 15,
    meta: { // Flexible object: Record<string, any>
      title: "Example title",
      desc: "Lorem ipsum",
      slug: "cool-digital-artifact",
      creator: {
        name: "Your Name",
        email: "artist@example.org",
        address: wallet.selectedAddress
      }
    },
    postage: 1500 // base value of the inscription in sats
  })

  // generate deposit address and fee for inscription
  const revealed = transaction.generateCommit();
  console.log(revealed) // deposit revealFee to address

  // confirm if deposit address has been funded
  const ready = await transaction.isReady();

  if (ready || transaction.ready) {
    // build transaction
    transaction.build();

    // sign transaction
    const signature = wallet.signPsbt(transaction.toHex());

    // Broadcast transaction
    const tx = await wallet.relayTx(signature, "testnet");
    console.log(tx);
  }
}

main();
