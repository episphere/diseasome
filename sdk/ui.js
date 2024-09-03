import {getPgs} from "./getPgs.js"
import {PRS} from "./prs.js"
import localforage from 'https://cdn.skypack.dev/localforage';
import {
    storage
} from './storage.js'
console.log("ui.js")

let userTxts = localforage.createInstance({
    name: "userTxts",
    storeName: "userTxts"
})
let usersByPhenotype = localforage.createInstance({
    name: "usersByPhenotype",
    storeName: "userusersByPhenotypeTxts"
})
let traitFilesTable = localforage.createInstance({
    name: "traitFilesTable",
    storeName: "traitFilesTable"
})

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});
let pgsCategories = localforage.createInstance({
    name: "pgsCategories",
    storeName: "pgsCategories"
})


let openSnpDbUrls = localforage.createInstance({
    name: "openSnpDbUrls",
    storeName: "userUrls"
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

    const userTxts = await getUsersByPhenotypeId(phenotypeId, keysLen, maxKeys)
    const phenotypeLabel = await getPhenotypeNameFromId(phenotypeId)
    // dt.users.phenotypes = phenotypes
    dt.users.phenotypeLabel = phenotypeLabel
    dt.users.phenotypeId = phenotypeId
    dt.users.txts = userTxts
    console.log("dt.users", dt.users)

    dt.pgs = {}
// TODO filter ids by variant number using get scoreFIles
    let pgsIds = (await (getPgs.idsFromCategory(category))).sort().slice(5,7)
    console.log("pgsIds", pgsIds)
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
    data.my23 = dt.users.txts.filter(x=> x.qc == true)//x.year > "2011" & 
    console.log("data",dt.users.txts.filter(x=>  x.qc == true))

    let prsDt = PRS.calc(data)
    // if prs qc failes for one user, remove the connected pgs entry
    console.log("prsDt", prsDt)

}

ui("prsDiv")

const getPgsIdsFromCategory = async function (category) {

    let arr = []
    let pgsIds = []
    // get trait files that match selected category from drop down
    const traitFiles = await traitFilesTable.getItem("traitFiles")
    traitFiles.map(tfile => {
        if (category.includes(tfile["trait_categories"][0])) {
            arr.push(tfile)
        }
    })

    if (arr.length != 0) {
        pgsIds.push(arr.flatMap(x => x.associated_pgs_ids).sort().filter((v, i) => arr.flatMap(x => x.associated_pgs_ids).sort().indexOf(v) == i))
    }
    return pgsIds.flatMap(x => x)
}

// get users with a specific phenotype, filter users with 23andme data 
const getUsersByPhenotypeId = async function (phenoId, keysLen, maxKeys) {

    let allUsers = await getAllUsers()
    const cors = `https://corsproxy.io/?`
    let onePhenotypeUrl = `https://opensnp.org/phenotypes/json/variations/${phenoId}.json`

    let users = await usersByPhenotype.getItem("onePhenotypeUrl")
    // console.log("users ",users )

    if (users == null){
        users = (await (await fetch(cors + onePhenotypeUrl)).json())
        usersByPhenotype.setItem(onePhenotypeUrl,users)
    }

    let userIds = users.users.map(x => x.user_id)
    // console.log("userIds",users)
    // get users with phenotype data (even those without genotype data)
    const userIds2 = allUsers.filter(({
        id
    }) => userIds.includes(id));
    let cleanUsers
    let maxUsers = 3
    if (userIds2.length < maxUsers) {
        cleanUsers =  getUsersByType("23andme", userIds2)
    } else {
        cleanUsers = ( getUsersByType("23andme", userIds2.slice(6, 19))).slice(0,maxUsers)
        console.log("Warning: user txts for phenotypeID", phenoId, "> 7. First 6 files used.")
    }
    // get 23 and me texts from urls using getTxts function
    let snpTxts = await getTxts(cleanUsers, keysLen, maxKeys)

    return snpTxts
}

// create 23andme obj and data 
const parseTxts = async function (txt, usersData) {
    let obj = {}
    let rows = txt.split(/[\r\n]+/g)
    // obj.txt = txt
    obj.openSnp = usersData

    let n = rows.filter(r => (r[0] == '#')).length
    if (n == 0) {
        obj.meta = false
        obj.cols = rows[n].slice(2).split(/\t/)
    } else {
        obj.meta = rows.slice(0, n - 1).join('\r\n')
        obj.cols = rows[n - 1].slice(2).split(/\t/)
    }
    obj.year = rows[0].split(/\r?\n|\r|\n/g)[0].slice(-4)
    obj.qc = rows[0].substring(0, 37) == '# This data file generated by 23andMe'
    obj.dt = rows.slice(n)
    obj.variant_number = obj.dt.length

    obj.dt = obj.dt.map((r, i) => {
        r = r.split('\t')
        r[2] = parseInt(r[2])
        // position in the chr
        r[4] = i
        return r
    })
    return obj
}

const getTxts = async function (usersData) {
    console.log("getTxts function running, even retreiving from storage is slow.")
    // clearTableUsingKeyLength(table,maxKeys)
    let arr = []
    let urls = usersData.map(x => x["genotype.download_url"])

    //remove old txts if table is full
    // let storageList = await table.keys()
    // //console.log("storageList.filter(x => urls.includes(x)",storageList.filter(x => urls.includes(x)))
    storage.clearTableButKeepKeyList(userTxts, urls)

    for (let i = 0; i < urls.length; i++) {
        let parsedUser2 = await userTxts.getItem(urls[i]);
        console.log("processing user #", i)
        // console.log("parsedUser2", parsedUser2)

        if (parsedUser2 == null) {
            console.log("user",i," not found in storage")
            let url2 = 'https://corsproxy.io/?' + urls[i]
            //console.log("urls[i]",urls[i])
            const user = (await (await fetch(url2)).text())
            // //console.log("useruser",user)
            let parsedUser = (await parseTxts(user, usersData[i]))

            arr.push(parsedUser)
            userTxts.setItem(urls[i], parsedUser);
        } else {
            console.log(i,"parsedUser2 NOT null");
            arr.push(parsedUser2)
        }
    }
    return arr
}

// filter users without 23andme data (type = "23andme")
const getUsersByType =  function (type, userIds) {
    // console.log("getUsersByType fun users",userIds)

    let arr = []
    userIds.filter(row => row.genotypes.length > 0).map(dt => {

        // keep user with one or more 23andme files
        dt.genotypes.map(i => {
            if (dt.genotypes.length > 0 && i.filetype == type) {
                let innerObj = {};
                innerObj["name"] = dt["name"];
                innerObj["id"] = dt["id"];
                innerObj["genotype.id"] = i.id;
                innerObj["genotype.filetype"] = i.filetype;
                innerObj["genotype.download_url"] = i.download_url.replace("http", "https")
                arr.push(innerObj)
            }
        })
    })
    return arr
}

const getPhenotypeNameFromId = async function (id) {

    const dt = await getUserPhenotypes()
    const name = dt.filter(x => x.id == id)[0].characteristic
    console.log("Phenotype id", id, "corresponds to:", name)
    return name
}

// get all users with genotype data (23andMe, illumina, ancestry etc)
const getAllUsers = async function () {
    const newLocal = 'usersFull';
    let dt
    dt = await openSnpDbUrls.getItem(newLocal); // check for users in localstorage
    if (dt == null) {
        let url = 'https://corsproxy.io/?https://opensnp.org/users.json'
        let users = (await (await fetch(url)).json())
        let dt2 = users.sort((a, b) => a.id - b.id)

        dt = openSnpDbUrls.setItem('usersFull', dt2)
    }
    return dt
}

const getUserPhenotypes = async function () {
    const allPhenotypesUrl = 'https://opensnp.org/phenotypes.json'
    const allPhenotypes = await userPhenotypes.getItem(allPhenotypesUrl);

    if (allPhenotypes == null) {
        const cors = `https://corsproxy.io/?`
        const allPhenotypes = (await (await fetch(cors + allPhenotypesUrl)).json()).sort((a, b) => b.number_of_users - a.number_of_users)
        userPhenotypes.setItem(allPhenotypesUrl, allPhenotypes);
    }
    // //console.log(allPhenotypes.length," phenotypes found ",allPhenotypes)
    return allPhenotypes
}

// export {ui}
