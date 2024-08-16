// import { fetchAll2 } from "./getpgs2";
import {storage} from "./storage.js"
// import {ui} from "./ui.js"

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

getPgs.traitFiles = async function(){
    console.log("---------------------------")
    console.log("running getPgs.traitFiles function")
    const traitFiles =(await storage.fetchAll("traitFiles",'https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
    return traitFiles
}


getPgs.idsFromCategory = async function(category) {
    console.log("---------------------------")
    console.log("running getPgs.idsFromCategory function")

    let arr = []
    let pgsIds = []
    // get trait files that match selected category from drop down
    const traitFiles = await getPgs.traitFiles()
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
    console.log("---------------------------")
    console.log("running getPgs.scoreFiles function")
    const scoreFiles = localforage.createInstance({
        name: "scoreFiles",
        storeName: "scoreFiles"
    })
    var scores = []
    let i = 0
    while (i < pgsIds.length) {
        let url = `https://www.pgscatalog.org/rest/score/${pgsIds[i]}`
        let cachedData = await scoreFiles.getItem(url);
        if (cachedData !== null) {
            scores.push(cachedData)
        } else if (cachedData == null) {
            console.log(i, "No cached data found for ", `${pgsIds[i]}`)
            await timeout(500); // pgs has 100 queries per minute limit
            let notCachedData =
                await (fetch(url)).then(function (response) {
                    return response.json()
                })
                .then(function (response) {
                    return response
                }).catch(function (ex) {
                    console.log("There has been an error: ", ex)
                })
                scoreFiles.setItem(url, notCachedData);
            scores.push(notCachedData)
        }
        i += 1
    }
    return scores
}


getPgs.categories = async function(){
    const categories = Array.from(new Set((await getPgs.traitFiles()).flatMap(x => x["trait_categories"])
.sort().filter(e => e.length).map(JSON.stringify)), JSON.parse)
return categories
}
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

console.log("storage?????",storage)

// ui("prsDiv")
// console.log("-----------------------------------")

// const category = "Cancer"
// console.log("PGS Category:",category)
// const traits = await getPgs.traits()
// console.log("traits",traits)
// const traitFiles = await getPgs.traitFiles()

// let pgsIds =  (await (getPgs.idsFromCategory(category))).sort().slice(0,6)
// console.log("pgsIds",pgsIds)
// let scoreFiles = (await getPgs.scoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
// console.log("scoreFiles",scoreFiles)

export {getPgs}