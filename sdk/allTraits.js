import {  plotly } from "../dependencies.js";
import localforage from 'https://cdn.skypack.dev/localforage';

console.log("---------------------")

console.log("allTraits.js loaded")
let allTraits = {
    dt: []
}

localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});
let pgs = localforage.createInstance({
    name: "pgs",
    storeName: "scoreFiles",    
})
let fetchAll = localforage.createInstance({
    name: "fetchAll",
    storeName: "urls"
})

const traitFiles = (await fetchAll2('https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
const traits = Array.from(new Set(traitFiles.flatMap(x => x["trait_categories"])
                .sort().filter(e => e.length).map(JSON.stringify)), JSON.parse)
                traits.map(x => getAllPgsIdsByCategory(x))

// get all data from API without limits--------------------------------------------
async function fetchAll2(url, maxPolls = null) {
    var spinner = document.getElementById("spinner");
    spinner.style.display = "block";
    const allResults = []
    const counts = (await (await (fetch(url))).json())
    if (maxPolls == null) maxPolls = Infinity

    // loop throught the pgs catalog API to get all files using "offset"
    for (let i = 0; i < Math.ceil(counts.count / 100); i++) { //4; i++) { //maxPolls; i++) {
        let offset = i * 100
        let queryUrl = `${url}?limit=100&offset=${offset}`

        // get trait files and scoring files from indexDB if the exist
        let cachedData = await fetchAll.getItem(queryUrl);

        // cach url and data 
        if (cachedData !== null) {
            allResults.push(cachedData)
        } else if (cachedData == null) {
            let notCachedData = (await (await fetch(queryUrl)).json()).results
            fetchAll.setItem(queryUrl, notCachedData);
            allResults.push(notCachedData)
        }
        if (allResults.length > 40) {
            break }
    }
    spinner.style.display = "none";
    return allResults
}
// remove local storage api requests that didnt go through--------------------
async function removeLocalStorageValues(target, dbName) {
    let i = await dbName.length();
    while (i-- > 0) {
        let key = await dbName.key(i);

        if ((await dbName.getItem(key)).message != undefined) { //.includes(target)) {
            dbName.removeItem(key);
            console.log("removeLocalStorageValues with failed requests (limits)",i)
        }
    }
}
removeLocalStorageValues('request',pgs)

// get pgsids for all 17 traits ------------------------------------------------
async function traitsData(traits) {
    let dt
    if ((await pgs.getItem("traitsData")) === null) {

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
        pgs.setItem("traitsData", dt)

    } else if (await pgs.getItem("traitsData") != null) {
        dt = await pgs.getItem("traitsData")
    }
    return dt
}
//--------------------------------------
function getAllPgsIdsByCategory(trait) {
    let traitFilesArr = []
    let pgsIds = []
    // get trait files that match selected trait from drop down
    traitFiles.map(tfile => {
        if (trait.includes(tfile["trait_categories"][0])) {
            traitFilesArr.push(tfile)        }
        })
        if (traitFilesArr.length != 0) {
            pgsIds.push(traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().filter((v, i) => traitFilesArr.flatMap(x => x.associated_pgs_ids).sort().indexOf(v) == i))
        }
    return pgsIds.flatMap(x => x)

}
//--------------------------------------
const timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//------------------------------------
async function getscoreFiles(pgsIds) {
    var scores = []
    let i = 0
    while (i < pgsIds.length) {
        let url = `https://www.pgscatalog.org/rest/score/${pgsIds[i]}`
        let cachedData = await pgs.getItem(url);
        if (cachedData !== null) {
            scores.push(cachedData)
        } else if (cachedData == null) {
            console.log(i, "No cached data found for ",`${pgsIds[i]}`)
            await timeout(150); // pgs has 100 queries per minute limit
            let notCachedData =
                await (fetch(url)).then(function (response) {return response.json()})
                .then(function (response) {
                    return response
                }).catch(function (ex) {
                    console.log("There has been an error: ", ex)
                })
            pgs.setItem(url, notCachedData);
            scores.push(notCachedData)
        }
        i += 1
    }
    return scores
}
// top bar plot of PGS entries by category--------------------------------------------------------------------------------
let allTraitsDt = (await traitsData( traits)).sort(function (a, b) {return a.count - b.count});
let topBarCategoriesDiv = document.getElementById("topBarCategories")
var layout = {
    height: 500,
    width: 500,
    autosize: true,
    title: `Counts of PGS entries across ${allTraitsDt.length} Categories`,
    margin: {
        l: 220,
        r: 50,
        t: -10,
        b: -10
    },
    xaxis: {
        autorange: false,
        range: [0, 300],
        type: 'linear'
    },
}
var dt = [{
    x: allTraitsDt.map(x => x.count),
    y: allTraitsDt.map(x => x.trait),
    type: 'bar',
    orientation: 'h',
    marker: {
        color: Array(allTraitsDt.length).fill(['orange', 'green', 'red',
            '#1f77b4', //muted blue
            '#ff7f0e', // safety orange
            '#2ca02c', // cooked asparagus green
            '#d62728', //brick red
            'blue', "goldenrod", "magenta",
            '#9467bd', //muted purple
            '#8c564b', //chestnut brown
            '#e377c2', //raspberry yogurt pink
            '#7f7f7f', //middle gray
            'yellow',
            '#bcbd22', //curry yellow-green
            '#17becf' //blue-teal])
        ]).flat().splice(0, allTraitsDt.length)
    }
}]
plotly.newPlot(topBarCategoriesDiv, dt, layout);

// top bar plot of PGS entries by category--------------------------------------------------------------------------------

let topBarTraitsDiv = document.getElementById("topBarTraits")
let traitList = traitFiles.sort((a, b) => a.associated_pgs_ids.length - b.associated_pgs_ids.length)

var layout = {
    autosize: true,
    height: traitFiles.length*4,
    title: `Counts of PGS entries across ${traitList.length} Traits`,
    margin: {
        l: 300},
    xaxis: {
        autorange: false,
        range: [0, 30],
        type: 'linear'
    }
}

var dt = [{
    x: traitFiles.map(x => x.associated_pgs_ids.length),
    y: traitFiles.map(x => x.label),
    type: 'bar',
    orientation: 'h',
    marker: {
        color: Array(traitList.length).fill(['orange', 'green', 'red',
            '#1f77b4', //muted blue
            '#ff7f0e', // safety orange
            '#2ca02c', // cooked asparagus green
            '#d62728', //brick red
            'blue',
            '#9467bd', //muted purple
            '#8c564b', //chestnut brown
            '#e377c2', //raspberry yogurt pink
            '#7f7f7f', //middle gray
            'yellow',
            '#bcbd22', //curry yellow-green
            '#17becf' //blue-teal])
        ]).flat().splice(0, traitList.length)
    }
}]
plotly.newPlot(topBarTraitsDiv, dt, layout);


// bar chart of variant sizes after category bar chart click-----------------------------------------
topBarCategoriesDiv.on('plotly_click', async function (data) {
    let pgsIds = getAllPgsIdsByCategory(data.points[0].y)
    let scoreFiles = (await getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)

    var layout = {
        autosize: true,
        height: 600,
        width: 600,
        title: `Variant sizes for ${pgsIds.length} "${data.points[0].y}" entries `,
        margin: {  l: 390,  r: 0,  t: -10, b: -10},

        xaxis: {
            autorange: false,
            range: [0, 500],
            type: 'linear'
        }
    }
    var data = [{
        x: scoreFiles.map(x => x.variants_number),
        y: scoreFiles.map(x => x.trait_reported.concat(" " + x.id)),
        type: 'bar',
        orientation: 'h',
        marker: {
            color: Array(scoreFiles.length).fill([data.points[0]['marker.color']]).flat().splice(0, scoreFiles.length)
        }
    }];
    plotly.newPlot('secondBarCategories', data, layout);
})

// bar chart of variant sizes after trait bar chart click-----------------------------------------
topBarTraitsDiv.on('plotly_click', async function (data) {
    let pgsIds = traitFiles.filter(tfile => tfile.label == data.points[0].label)[0].associated_pgs_ids

    let scoreFiles = (await getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    var layout = {
        autosize: true,
        title: `Variant sizes for ${pgsIds.length} "${data.points[0].y}" entries `,
        margin: {  l: 390 },
        xaxis: {
            autorange: false,
            range: [0, 500],
            type: 'linear'
        },
    }
    var data = [{
        x: scoreFiles.map(x => x.variants_number),
        y: scoreFiles.map(x => x.trait_reported.concat(" " + x.id)),
        type: 'bar',
        orientation: 'h',
        marker: {
            color: Array(scoreFiles.length).fill([data.points[0]['marker.color']]).flat().splice(0, scoreFiles.length)
        }
    }];
    plotly.newPlot('secondBarTraits', data, layout);
})

// pie chart of traits -----------------------------------
topBarCategoriesDiv.on('plotly_click', async function (data) {
    let pgsIds = getAllPgsIdsByCategory(data.points[0].y)
    let scoreFiles = (await getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)

    var obj = {};
    scoreFiles.forEach(function (item) {
        obj[item.trait_reported] ? obj[item.trait_reported]++ : obj[item.trait_reported] = 1;
    });
    var layout = {
    title: `${Object.keys(obj).length} traits found in "${data.points[0].y}" Category`,
    autosize: true,
    // height: 600,
    // width: 600,
    }
    var data = [{
        values: Object.values(obj),
        labels: Object.keys(obj),
        type: 'pie',
        textposition:'inside'
    }];

    plotly.newPlot('pgsPie', data, layout);

    // bar chart of variant size by trait from pie selection------------------------
    document.getElementById("pgsPie").on('plotly_click', async function (data3) {
        let res = scoreFiles.filter(x => x.trait_reported === data3.points[0].label).sort((a, b) => a.variants_number - b.variants_number)
        console.log("res", res)

        var data2 = [{
            x: res.map(x => x.variants_number),
            y: res.map(x => x.trait_reported.concat(" " + x.id)),
            type: 'bar',
            orientation: 'h',
            marker: {
                color: data3.points[0].color,
            }
        }];
        var layout = {
            autosize: true,
            title: `Variant sizes ${res.length} "${data3.points[0].label}" entries`,
            margin: {    l: 290,  r: 20,  t: -10, b: -10 },
            xaxis: {
                autorange: false,
                range: [0, 500],
                type: 'linear'
            },
        }
        plotly.newPlot('thirdBarCategories', data2, layout);

    })
})

//-----------------------------------


export {
    allTraits
}
