// import {getPgs} from "./getPgs.js"
// import {get23} from "./get23.js"
import localforage from 'https://cdn.skypack.dev/localforage';
import {storage} from './storage.js'
console.log("ui.js")

let userTxts = localforage.createInstance({
    name: "userTxts",
    storeName: "userTxts"
})

let traitFiles = localforage.createInstance({
    name: "traitFiles",
    storeName: "traitFiles"
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
// gettraitFiles()
const idsFromCategory = async function(category) {
    //console.log("---------------------------")
    //console.log("running getPgs.idsFromCategory function")

    let arr = []
    let pgsIds = []
    // get trait files that match selected category from drop down
    const traitFiles = await getTraitFiles()
    //console.log("traitFiles",traitFiles)

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
const getTraitFiles = async function(){
    //console.log("---------------------------")
    //console.log("running getPgs.traitFiles function")
    let keys = await traitFiles.keys()
    let tf =  (await Promise.all(keys.flatMap(async key => {return traitFiles.getItem(key)}))).flatMap(x=>x)
    //console.log("tf",tf)

    if(tf == undefined){
        //console.log("tf == undefined",tf == undefined)
    tf =(await storage.fetchAll("traitFiles",'https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
    }
    return tf
}

const ui = async function(targetDiv ) {
    targetDiv = document.getElementById(targetDiv)

    let div = document.createElement('div')
    targetDiv.appendChild(div)
    div.id = 'data'
    div.innerHTML = `
    <p>Select a PGS Category:</p>`
    console.log("ui-----------------------------")

    //console.log("PGS CATALOG-----------------------------------")
    const dt = {}
    const category = "Cancer"
  // we need to define pgs categories and user phenotypes functions in the UI or it's slow to load from another page
    let categories
     categories = await pgsCategories.getItem("categories")
     console.log("categories",categories)
    if (categories == null){
        console.log("categories == null")
        const cors = `https://corsproxy.io/?`
        const url  = "https://www.pgscatalog.org/rest/trait_category/all"  
        categories =  (await fetch(cors + url)).json().results.sort()
        pgsCategories.setItem("categories",categories)
        console.log("categories",await categories)

    }
    console.log("ui categories",await categories)
    // const traits = await getPgs.traits()
    //console.log("traits",traits)
    // const traitFiles = await get traitFiles()

    // let pgsIds =  (await (getPgs.idsFromCategory(category))).sort().slice(0,6)
    //console.log("pgsIds",pgsIds)


    dt.pgs = {}

    dt.pgs.categories = await categories.results
    // dt.pgs.traits = traits

    console.log(" Object.keys(dt.pgs.categories)", dt.pgs.categories)
    // Create the dropdown (select) element
    const dropdown = document.createElement("select");
    // Create options and add them to the dropdown
    (dt.pgs.categories).map(x=> {
        const op = new Option();
        op.value = x.label;
        op.text = x.label;
        dropdown.options.add(op)
})
    // Add the dropdown to the div
    div.appendChild(dropdown);

    //console.log("USERS----------------------------------")

    let phenotypes
    phenotypes = await userPhenotypes.getItem('https://opensnp.org/phenotypes.json'
);

    if (phenotypes == null) {
        console.log("phenotypes == null",phenotypes == null)

        const url = 'https://opensnp.org/phenotypes.json'
        const cors = `https://corsproxy.io/?`
        const phenotypes = (await (await fetch(cors + url)).json()).sort((a, b) => b.number_of_users - a.number_of_users)
        userPhenotypes.setItem(url, phenotypes);
    }
    const id = 3
    const keysLen = 5
    const maxKeys = 14
    const storageSize = 1.3
    // const userTxts = await getUsersByPhenotypeId(id,keysLen,maxKeys)
    // const name = await getPhenotypeNameFromId(id)
    // const phenotypes = (await getUserPhenotypes()).sort((a, b) => a.id - b.id)
    console.log("phenotypes",phenotypes)

//     dt.user = {}
//     dt.user.phenotypes = phenotypes
//     dt.user.phenotypeName = name
//     dt.user.phenotypeId = id
//     dt.user.txts = userTxts
//     div.data = dt
// // user drop down list
    let div2 = document.createElement('div')
    targetDiv.appendChild(div2)
    div2.id = 'userData'
    div2.innerHTML = `
    <br><p>Select a user Category:</p>`
      // Create the dropdown (select) element
      const dropdown2 = document.createElement("select");
      // Create options and add them to the dropdown
        phenotypes.map(x=> {

          const op = new Option();
          op.value = x.characteristic;
          op.text = x.characteristic;
          dropdown2.options.add(op)
  })
      // Add the dropdown to the div
      div2.appendChild(dropdown2);
    const userTxts = await getUsersByPhenotypeId(id,keysLen,maxKeys)
    const name = await getPhenotypeNameFromId(id)
    console.log("name",name)

    dt.user = {}
    dt.user.phenotypes = phenotypes
    dt.user.phenotypeName = name
    dt.user.phenotypeId = id
    dt.user.txts = userTxts

    console.log("dt",dt)
}
ui("prsDiv")


// get users with a specific phenotype, filter users with 23andme data 
const getUsersByPhenotypeId = async function (phenoId,keysLen,maxKeys) {
    //console.log("---------------------------")
    //console.log("running... getUsersByPhenotypeId function")
    //console.log("phenotype id:", phenoId)

    let allUsers = await  getAllUsers()
    const cors = `https://corsproxy.io/?`
    let onePhenotypeUrl = `https://opensnp.org/phenotypes/json/variations/${phenoId}.json`
    let users = (await (await fetch(cors + onePhenotypeUrl)).json())
    let userIds = users.users.map(x => x.user_id)
    // get users with phenotype data (even those without genotype data)
    const userIds2 = allUsers.filter(({
        id
    }) => userIds.includes(id));
    let cleanUsers
    if (userIds2.length < 6) {
        cleanUsers = await getUsersByType("23andme", userIds2)
    } else {
        cleanUsers = (await getUsersByType("23andme", userIds2.slice(4,15))).slice(0,6)
        //console.log("Warning: user txts for phenotypeID", phenoId, "> 6. First 6 files used.")
    }
    // get 23 and me texts from urls using getTxts function
    let snpTxts = await getTxts(cleanUsers,keysLen,maxKeys)

    //console.log("User txts for phenotypeID", phenoId, ": ", snpTxts)
    return snpTxts
}


// create 23andme obj and data 
const parseTxts = async function (txt, usersData) {
    let obj = {}
    let rows = txt.split(/[\r\n]+/g)
    obj.txt = txt
    obj.openSnp = usersData

    let n = rows.filter(r => (r[0] == '#')).length
    if (n==0){
        obj.meta = false
        obj.cols = rows[n].slice(2).split(/\t/)
    }else {
        obj.meta = rows.slice(0, n - 1).join('\r\n')
        obj.cols = rows[n - 1].slice(2).split(/\t/)
    }
    obj.year = rows[0].split(/\r?\n|\r|\n/g)[0].slice(-4)
    obj.qc = rows[0].substring(0, 37) == '# This data file generated by 23andMe'
    obj.dt = rows.slice(n)
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
    //console.log("getTxts function")
    // clearTableUsingKeyLength(table,maxKeys)
    let arr = []
    let  urls= usersData.map(x => x["genotype.download_url"])

    //remove old txts if table is full
    // let storageList = await table.keys()
    // //console.log("storageList.filter(x => urls.includes(x)",storageList.filter(x => urls.includes(x)))

    storage.clearTableButKeepKeyList(userTxts, urls)

    for (let i = 0; i < urls.length; i++) {
        let parsedUser2 = await userTxts.getItem(urls[i]);
        //console.log("processing user #", i)

        if (parsedUser2 == null) {
            // //console.log("i, parsedUser2 == null")
            let url2 = 'https://corsproxy.io/?' + urls[i]
            //console.log("urls[i]",urls[i])
            const user = (await (await fetch(url2)).text())
            // //console.log("useruser",user)
            let parsedUser = (await parseTxts(user, usersData[i]))

            // //console.log("parsedUser",parsedUser)
            arr.push(parsedUser)
            userTxts.setItem(urls[i], parsedUser);
        } else {
            // //console.log(i,"parsedUser2 NOT null");
            arr.push(parsedUser2)
        }
    }
    return arr
}

// filter users without 23andme data (type = "23andme")
const getUsersByType = async function (type, users) {
    let arr = []
    users.filter(row => row.genotypes.length > 0).map(dt => {

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
    //console.log("---------------------------")
    //console.log("running... getPhenotypeNameFromId function")
    const dt = await getUserPhenotypes()
    // //console.log("dt",dt)
    const name = dt.filter(x => x.id == id)[0].characteristic
    //console.log("Phenotype id", id, "corresponds to:", name)
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


export{ui}
