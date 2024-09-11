import {getPgs} from "./getPgs.js"
import {get23} from "./get23.js"

import {PRS} from "./prs.js"
import localforage from 'https://cdn.skypack.dev/localforage';


let pgsCategories = localforage.createInstance({
    name: "pgsCategories",
    storeName: "pgsCategories"
})

let userPhenotypes = localforage.createInstance({
    name: "userPhenotypes",
    storeName: "userPhenotypes"
})

// const traitFiles = getTraitFiles()

const ui = async function (targetDiv) {
    targetDiv = document.getElementById(targetDiv)

    let div = document.createElement('div')
    targetDiv.appendChild(div)
    div.id = 'pgsDiv'
    div.innerHTML = `
    <p>Select a PGS Category:</p>`

    // DROPDOWN PGS entries ///////////////////////////////////////////////////////////
    const dt = {}
    // const category = "Cancer"
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
    dropdown.id = "pgsSelect";

    // Create options and add them to the dropdown
    (await categories.results).map(x => {
        // console.log("x",x)
        const op = new Option();
        if(x.label == "Cancer"){op.defaultSelected = "Cancer"}
        op.value = x.label;
        op.text = x.label;
        dropdown.options.add(op)
    })
 
    // Add the dropdown to the div
    div.appendChild(dropdown);

    let category = "Cancer"
    dt.pgs = {}
    let pgsIds = (await (getPgs.idsFromCategory(category))).sort().slice(5,8)
            
    console.log("pgsIds",pgsIds)
    let pgsTxts = await Promise.all( pgsIds.map(async x => {
        let res = await getPgs.loadScoreHm(x)
        return res
    }))

    dt.pgs.category = category
    dt.pgs.ids = pgsIds
    dt.pgs.txts = pgsTxts
    //TODO, make dropdown select onchange reversable
    document.getElementById("pgsSelect").addEventListener("change", async (e) => {
         category = e.target.value
        console.log("PGS category selected: ",e.target.value)
        // TODO filter ids by variant number using get scoreFIles
            let pgsIds = (await (getPgs.idsFromCategory(category))).sort().slice(5,8)
            
            console.log("pgsIds",pgsIds)
            let pgsTxts = await Promise.all( pgsIds.map(async x => {
                let res = await getPgs.loadScoreHm(x)
                return res
            }))
        
            dt.pgs.category = category
            dt.pgs.ids = pgsIds
            dt.pgs.txts = pgsTxts
    })

    // DROPDOWN 23andme users ///////////////////////////////////////////////////////////
    let phenotypes
    phenotypes = (await userPhenotypes.getItem('https://opensnp.org/phenotypes.json')).sort((a, b) => a.characteristic.localeCompare(b.characteristic))
    // console.log("phenotypes",phenotypes)

    if (phenotypes == null) {
        const phenotypes = (await (await fetch(`https://corsproxy.io/?https://opensnp.org/phenotypes.json`)).json()).sort((a, b) => b.number_of_users - a.number_of_users)
        userPhenotypes.setItem(url, phenotypes);
    }
    // const phenotypeId = 3
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
    dropdown2.id = "userSelect"
    // Create options and add them to the dropdown
    phenotypes.map(x => {
        const op = new Option();
        op.value = x.characteristic;
        op.text = x.characteristic;
        dropdown2.options.add(op)
    })
    // add dropdown to the div
    dt.users = {}

    div2.appendChild(dropdown2);
    document.getElementById("userSelect").addEventListener("change", async (e) => {
        console.log("User category selected: ",e.target.value)
        const phenotypeLabel = e.target.value
        const phenotypeId =  await get23.getPhenotypeIdFromName(phenotypeLabel)
        const userTxts = (await get23.getUsersByPhenotypeId(phenotypeId, keysLen, maxKeys)).filter(x=> x.qc == true)
        
        // dt.users.phenotypes = phenotypes
        dt.users.phenotypeLabel = phenotypeLabel
        dt.users.phenotypeId = phenotypeId
        dt.users.txts = userTxts
        console.log("dt------", dt)
// TODO add onlcick button for prsc calculation
        // console.log("userTxts", userTxts)
         // SAVE PGS AND 23me DATA IN DT OBJ///////////////////////////
    // create input matrix for prs.calc
    let data = {}
    data.PGS =  dt.pgs.txts
    data.my23 = dt.users.txts//x.year > "2011" & 
     console.log("data", data)

    //calculate prs    
    let prsDt = await PRS.calc(data)
    prsDt.pgs.category = category
    // if prs qc failes for one user, remove the connected pgs entry
    console.log("results: ",  prsDt)
    })


}

ui("prsDiv")

export {ui}
