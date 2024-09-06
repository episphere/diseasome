import {getPgs} from "./getPgs.js"
import {get23} from "./get23.js"

import {PRS} from "./prs.js"
import localforage from 'https://cdn.skypack.dev/localforage';
import {storage} from './storage.js'
console.log("ui.js")


let traitFilesTable = localforage.createInstance({
    name: "traitFilesTable",
    storeName: "traitFilesTable"
})

// localforage.config({
//     driver: [
//         localforage.INDEXEDDB,
//         localforage.LOCALSTORAGE,
//         localforage.WEBSQL
//     ],
//     name: 'localforage'
// });
let pgsCategories = localforage.createInstance({
    name: "pgsCategories",
    storeName: "pgsCategories"
})


let userPhenotypes = localforage.createInstance({
    name: "userPhenotypes",
    storeName: "userPhenotypes"
})


const getTraitFiles = async function () {
    const tf = traitFilesTable.getItem("traitFiles")
    // let tf =  (await Promise.all(keys.flatMap(async key => {return traitFiles.traitFilesTable(key)}))).flatMap(x=>x)

    if (tf.length == 0) {
        tf = (await storage.fetchAll("traitFiles", 'https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
        traitFilesTable.setItem("traitFiles", tf)
    }
    // console.log("tf", awaittf)
    return tf
}

const traitFiles = getTraitFiles()

const ui = async function (targetDiv) {
    targetDiv = document.getElementById(targetDiv)

    let div = document.createElement('div')
    targetDiv.appendChild(div)
    div.id = 'pgsDiv'
    div.innerHTML = `
    <p>Select a PGS Category:</p>`

    // DROPDOWN PGS entries ///////////////////////////////////////////////////////////
    const dt = {}
    const category = "Cancer"
    // we need to define pgs categories and user phenotypes functions in the UI or it's slow to load from another page
    let categories
    categories = await pgsCategories.getItem("categories")
    // console.log("categories", categories)
    if (categories == null) {
        console.log("categories == null")
        categories = (await fetch(`https://corsproxy.io/?https://www.pgscatalog.org/rest/trait_category/all`)).json().results.sort()
        pgsCategories.setItem("categories", categories)
    }
    // Create the dropdown (select) element
    const dropdown = document.createElement("select");
    // Create options and add them to the dropdown
    (await categories.results).map(x => {
        const op = new Option();
        op.value = x.label;
        op.text = x.label;
        dropdown.options.add(op)
    })
    // Add the dropdown to the div
    div.appendChild(dropdown);

    // DROPDOWN 23andme users ///////////////////////////////////////////////////////////
    let phenotypes
    phenotypes = await userPhenotypes.getItem('https://opensnp.org/phenotypes.json');

    if (phenotypes == null) {
        const phenotypes = (await (await fetch(`https://corsproxy.io/?https://opensnp.org/phenotypes.json`)).json()).sort((a, b) => b.number_of_users - a.number_of_users)
        userPhenotypes.setItem(url, phenotypes);
    }
    const phenotypeId = 3
    const keysLen = 5
    const maxKeys = 14
    const storageSize = 1.3

    // user drop down list
    let div2 = document.createElement('div')
    targetDiv.appendChild(div2)
    div2.id = 'userDiv'
    div2.innerHTML = `
    <br><p>Select a user Category:</p>`
    // Create the dropdown (select) element
    const dropdown2 = document.createElement("select");
    // Create options and add them to the dropdown
    phenotypes.map(x => {
        const op = new Option();
        op.value = x.characteristic;
        op.text = x.characteristic;
        dropdown2.options.add(op)
    })
    // add dropdown to the div
    div2.appendChild(dropdown2);

    // SAVE PGS AND 23me DATA IN DT OBJ///////////////////////////
    dt.users = {}

    const userTxts = (await get23.getUsersByPhenotypeId(phenotypeId, keysLen, maxKeys)).filter(x=> x.qc == true)
    const phenotypeLabel = await get23.getPhenotypeNameFromId(phenotypeId)
    // dt.users.phenotypes = phenotypes
    dt.users.phenotypeLabel = phenotypeLabel
    dt.users.phenotypeId = phenotypeId
    dt.users.txts = userTxts
    console.log("userTxts", userTxts)

    dt.pgs = {}
// TODO filter ids by variant number using get scoreFIles
    let pgsIds = (await (getPgs.idsFromCategory(category))).sort().slice(5,7)
    let pgsTxts = await Promise.all( pgsIds.map(async x => {
        let res = await getPgs.loadScoreHm(x)
        return res
    }))

    dt.pgs.category = category
    dt.pgs.ids = pgsIds
    dt.pgs.txts = pgsTxts

    //calculate prs    
    console.log("Calculating PRS scores!")

    let data = {}
    data.PGS =  dt.pgs.txts
    data.my23 = dt.users.txts//x.year > "2011" & 
    console.log("input data: ",data)

    let prsDt = await PRS.calc(data)
    prsDt.pgs.category = category
    // if prs qc failes for one user, remove the connected pgs entry
    console.log("results: ",  prsDt)

}

ui("prsDiv")

export {ui}
