import {storage} from "./storage.js"

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
    console.log("running getPgs.traitFiles function-------------------")
    const traitFiles =(await storage.fetchAll("traitFiles",'https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
    return traitFiles
}

getPgs.idsFromCategory = async function(category) {
    console.log("running getPgs.idsFromCategory function-------------------")

    let arr = []
    let pgsIds = []
    // get trait files that match selected category from drop down
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
    console.log("running getPgs.scoreFiles function-------------------")
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

const category = "Cancer"


const traitFiles = await getPgs.traitFiles()

let pgsIds =  (await (getPgs.idsFromCategory(category))).sort().slice(0,6)
console.log("pgsIds",pgsIds)
let scoreFiles = (await getPgs.scoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
console.log("scoreFiles",scoreFiles)

export{getPgs}