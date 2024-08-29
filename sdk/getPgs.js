// import { fetchAll2 } from "./getpgs2";
import {storage} from "./storage.js"
// import {ui} from "./ui.js"
import pako from 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.esm.mjs'

let getPgs = {}

import localforage from 'https://cdn.skypack.dev/localforage';

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});

let pgsTxts = localforage.createInstance({
    name: "pgsTxts",
    storeName: "pgsTxts",
})

let traitFiles = localforage.createInstance({
    name: "traitFiles",
    storeName: "traitFiles"
})
let pgsCategories = localforage.createInstance({
    name: "pgsCategories",
    storeName: "pgsCategories"
})
getPgs.traitFiles = async function(){
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


getPgs.idsFromCategory = async function(category) {
    //console.log("---------------------------")
    //console.log("running getPgs.idsFromCategory function")

    let arr = []
    let pgsIds = []
    // get trait files that match selected category from drop down
    const traitFiles = await getPgs.traitFiles()
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



const timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// get score files using pgs ids list and subset those with less than 30 variants
getPgs.scoreFiles = async function(pgsIds) {
    //console.log("---------------------------")
    //console.log("running getPgs.scoreFiles function")
    const scoreFiles = localforage.createInstance({
        name: "scoreFiles",
        storeName: "scoreFiles"
    })
    var scores = []
    storage.saveData(scores,`https://www.pgscatalog.org/rest/score/`,pgsIds)
    return scores
}




// check if data is in storage, if not save (await getPgs.traitFiles())
getPgs.categories3 = async function(){
    const categories = await pgsCategories.getItem("categories")
    if (categories == null){
        const cors = `https://corsproxy.io/?`
        const url  = "https://www.pgscatalog.org/rest/trait_category/all"  
        const categories =  (await fetch(cors + url))//.sort()
        pgsCategories.setItem("categories",categories)
    }
    //console.log("categories",categories)
    return categories
}
await getPgs.categories3()


getPgs.traits = async function(){
    const arr = []
    Array.from(new Set((await getPgs.traitFiles()).flatMap(x => {const obj = {}; obj[x["id"]] = x["label"]; arr.push(obj)})))
//.sort().filter(e => e.length).map(JSON.stringify)), JSON.parse)
return arr
}


// get pgsids for all 17 traits ------------------------------------------------
getPgs.traitsData = async function(traits) {
    const traitsData = localforage.createInstance({
        name: "traitsData",
        storeName: "traitsData"
    })
    let dt
    if ((await traitsData.getItem("traitsData")) === null) {

        dt = traits.map(trait => {
            let traitFilesArr = []
            let pgsIds = []

            traitFiles.map(tfile => {
                if (trait.includes(tfile["trait_categories"][0])) {
                    traitFilesArr.push(tfile)
                }
            })
            if (traitFilesArr.length != 0) {
                pgsIds.push(traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().filter((v, i) => traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().indexOf(v) == i))
            }
            let pgsIds2 = pgsIds.flatMap(x => x)

            let obj = {}
            obj["trait"] = trait
            obj["count"] = pgsIds2.length
            obj["pgsIds"] = pgsIds2
            obj["traitFiles"] = traitFilesArr
            return obj
        })
        traitsData.setItem("traitsData", dt)

    } else if (await traitsData.getItem("traitsData") != null) {
        dt = await traitsData.getItem("traitsData")
    }
    return dt
}
////console.log("storage?????",storage)

// ui("prsDiv")
// ////console.log("-----------------------------------")

// const category = "Cancer"
// ////console.log("PGS Category:",category)
// const traits = await getPgs.traits()
// ////console.log("traits",traits)
// const traitFiles = await getPgs.traitFiles()

// let pgsIds =  (await (getPgs.idsFromCategory(category))).sort().slice(0,6)
// ////console.log("pgsIds",pgsIds)
// let scoreFiles = (await getPgs.scoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
// ////console.log("scoreFiles",scoreFiles)
// PGS ///////////////////////////////////////////////////////////////////////////////
// getPgs.getscoreFiles = async function (pgsIds) {
//     var scores = []
//     let i = 0
//     while (i < pgsIds.length) {
//         console.log("pgsIds[i]",pgsIds.length,pgsIds[i])
//         let url = `https://www.pgscatalog.org/rest/score/${pgsIds[i]}`
//         await timeout(150); // pgs has 100 queries per minute limit
//         let data =
//             await (fetch(url)).then(function (response) {
//                 return response.json()
//             })
//             .then(function (response) {
//                 return response
//             }).catch(function (ex) {
//                 console.log("There has been an error: ", ex)
//             })
//         scores.push(data)    
//         i += 1
//     }
//     return scores
// }


//console.log("pgs",await getscoreFiles(["PGS002130"]))

getPgs.loadScoreHm = async function(entry, build = 37, range) {
    let txt = ""
    let dt
    dt = await pgsTxts.getItem(entry); // check for users in localstorage
    if (entry == null){
         txt = "no pgs entry provided"
        return txt
    } else if (dt == null){
        console.log("pgs txt file not found in storage",dt)

        txt = ""
        entry = "PGS000000".slice(0, -entry.length) + entry
        // https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/PGS000004/ScoringFiles/Harmonized/PGS000004_hmPOS_GRCh37.txt.gz
        const url = `https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/${entry}/ScoringFiles/Harmonized/${entry}_hmPOS_GRCh${build}.txt.gz` //
        if (range) {
            if (typeof (range) == 'number') {
                range = [0, range]
            }
            txt = pako.inflate(await (await fetch(url, {
                headers: {
                    'content-type': 'multipart/byteranges',
                    'range': `bytes=${range.join('-')}`,
                }
            })).arrayBuffer(), {
                to: 'string'
            })
        } else {
            txt = pako.inflate(await (await fetch(url)).arrayBuffer(), {
                to: 'string'
            })
        }
        // Check if PGS catalog FTP site is down-----------------------
        let response
        response = await fetch(url) // testing url 'https://httpbin.org/status/429'
        if (response?.ok) {
            ////console.log('Use the response here!');
        } else {
            txt = `:( Error loading PGS file. HTTP Response Code: ${response?.status}`
            document.getElementById('pgsTextArea').value = txt
        }
        txt = await getPgs.parsePGS(entry, txt)
        pgsTxts.setItem(entry, txt)
} else if (dt != null){
    console.log("pgs txt file found in storage")
    txt = dt
    }

    return txt
}

// create PGS obj and data --------------------------
getPgs.parsePGS = async function(id, txt) {
    let obj = {
        id: id
    }
    obj.txt = txt
    let rows = obj.txt.split(/[\r\n]/g)
    let metaL = rows.filter(r => (r[0] == '#')).length
    obj.meta = {
        txt: rows.slice(0, metaL)
    }
    obj.cols = rows[metaL].split(/\t/g)

    obj.dt = rows.slice(metaL + 1).map(r => r.split(/\t/g))
    if (obj.dt.slice(-1).length == 1) {
        obj.dt.pop(-1)
    }

    // check betas here and added QC
    let betaIdx = obj.cols.indexOf('effect_weight')
    let betas = obj.dt.map( x => x[betaIdx])
    let qc1= betas.some(el => el < -0.00002) // false, if no beta is less than 0
    let qc2 = betas.some(el => el < 10 ) // false, if beta is greater than 10
    obj.qc = "true"//qcText
    // console.log("id",  id)
    // console.log("!qc1",  !qc1)
    // console.log("!qc2",  !qc2)

    if(!qc1 || !qc2){
           obj.qc = "false"//failed both qc1 and qc2
        }
            

    // parse numerical types
    const indInt = [obj.cols.indexOf('chr_position'), obj.cols.indexOf('hm_pos')]
    const indFloat = [obj.cols.indexOf('effect_weight'), obj.cols.indexOf('allelefrequency_effect')]
    const indBol = [obj.cols.indexOf('hm_match_chr'), obj.cols.indexOf('hm_match_pos')]

    // /* this is the efficient way to do it, but for large files it has memory issues
    obj.dt = obj.dt.map(r => {
        // for each data row
        indFloat.forEach(ind => {
            r[ind] = parseFloat(r[ind])
        })
        indInt.forEach(ind => {
            r[ind] = parseInt(r[ind])
        })
        indBol.forEach(ind => {
            r[ind] = (r[11] == 'True') ? true : false
        })
        return r
    })
    // parse metadata
    obj.meta.txt.filter(r => (r[1] != '#')).forEach(aa => {
        aa = aa.slice(1).split('=')
        obj.meta[aa[0]] = aa[1]
    })
    return obj
}


export {getPgs}