import {getPgs} from "./getPgs.js"
import {get23} from "./get23.js"

let userTxts = localforage.createInstance({
    name: "userTxts",
    storeName: "userTxts"
})


import localforage from 'https://cdn.skypack.dev/localforage';

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
}); 

const ui = async function(targetDiv = document.body) {
    console.log("ui-----------------------------")
    // target div for the user interface
    //console.log(`prsCalc module imported at ${Date()}`)
    if (typeof (targetDiv) == 'string') {
         targetDiv = document.getElementById(targetDiv)
         console.log("targetDiv",targetDiv)
    }

    console.log("PGS CATALOG-----------------------------------")
    const dt = {}
    const category = "Cancer"
    console.log("PGS Category:",category)
    const categories = await getPgs.categories()
    console.log("categories",categories)
    const traits = await getPgs.traits()
    console.log("traits",traits)
    const traitFiles = await getPgs.traitFiles()

    let pgsIds =  (await (getPgs.idsFromCategory(category))).sort().slice(0,6)
    console.log("pgsIds",pgsIds)

    let div = document.createElement('div')
    targetDiv.appendChild(div)
    div.id = 'data'
    div.innerHTML = `
    <p>Select a PGS Category:</p>`
    dt.pgs = {}
    dt.pgs.categories = categories
    dt.pgs.traits = traits

    // Create the dropdown (select) element
    const dropdown = document.createElement("select");
    // Create options and add them to the dropdown
    dt.pgs.categories.map(x=> {
        const op = new Option();
        op.value = x;
        op.text = x;
        dropdown.options.add(op)
})
    // Add the dropdown to the div
    div.appendChild(dropdown);

    console.log("USERS----------------------------------")

    const id = 3
    const keysLen = 9
    const maxKeys = 14
    // const storageSize = 1.3
    const userTxts = await get23.getUsersByPhenotypeId(id,keysLen)
    const name = await get23.getPhenotypeNameFromId(id)
    const phenotypes = (await get23.getUserPhenotypes()).sort((a, b) => a.id - b.id)
    console.log("phenotypes",phenotypes)

    dt.user = {}
    dt.user.phenotypes = phenotypes
    dt.user.phenotypeName = name
    dt.user.phenotypeId = id
    dt.user.txts = userTxts
    div.data = dt
// user drop down list
    let div2 = document.createElement('div')
    targetDiv.appendChild(div2)
    div2.id = 'userData'
    div2.innerHTML = `
    <p>Select a user Category:</p>`
      // Create the dropdown (select) element
      const dropdown2 = document.createElement("select");
      // Create options and add them to the dropdown
      dt.user.phenotypes.map(x=> {
          const op = new Option();
          op.value = x.characteristic;
          op.text = x.characteristic;
          dropdown2.options.add(op)
  })
      // Add the dropdown to the div
      div2.appendChild(dropdown2);
}

ui("prsDiv")
// console.log("getPgs",getPgs)

export{ui}
