import { plotly} from "../dependencies.js";
import {functions} from "./main.js"
import {sdk} from "./sdk.js"
import localforage from 'https://cdn.skypack.dev/localforage';
localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ],
    name: 'localforage'
});
let userPhenotypes = localforage.createInstance({
    name: "userPhenotypes",
    storeName: "userPhenotypes"
})

let userPhenotype = localforage.createInstance({
    name: "userPhenotype",
    storeName: "userPhenotype"
})

let userPhenotype2 = localforage.createInstance({
    name: "userPhenotype2",
    storeName: "userPhenotype2"
})

let cors = `https://corsproxy.io/?`

const output = {pgs:[], snp:[]}
// plot opensnp data types --------------
//functions.removeLocalStorageValues('request', pgs)

let users = (await functions.getUsers())
let usersFlat = users.flatMap(x=>x.genotypes)

var obj = {};
var counter = {}

for (var i = 0, len = usersFlat.length; i < len; i++) {
  obj[usersFlat[i]['filetype']] = usersFlat[i];
  counter[usersFlat[i]['filetype']] = (counter[usersFlat[i]['filetype']] || 0) + 1
}
let datatypesCounts = new Array();
for (var key in obj){
    datatypesCounts.push(extend( obj[key], {count:counter[key]}));
}

function extend(a, b){
    for(var key in b)
        if(b.hasOwnProperty(key))
            a[key] = b[key];
    return a;
}


// plot openSNP------------------------------------------------------------
let snpDiv = document.getElementById("snp")
var layout = {
    autosize: false,
    height: 300, 
    width: 400,
    title: `OpenSNP datatypes`,
 margin: {l:150,b:-300},
    xaxis: {
        autorange: false,
        range: [0, 1000],
        type: 'linear',
        title: {
           // standoff: 10,
            text: "Counts"},
    },
    yaxis:{
   
    }
}
var dt = [{
    x: datatypesCounts.map(x => x.count),
    y: datatypesCounts.map(x => x.filetype),
    type: 'bar',
    orientation: 'h',
    marker: {
        color: Array(datatypesCounts.length).fill([
            'blue', "goldenrod", "magenta",
            '#8c564b', //chestnut brown
            '#9467bd', //muted purple
            'red', //raspberry yogurt pink
            'green', //middle gray
        ]).flat().splice(0, datatypesCounts.length)
    }
}]
plotly.newPlot(snpDiv, dt, layout);
// download button for opensnp data---------------------------------
snpDiv.on('plotly_click', async function (data) {
    let snpLabel = data.points[0].label
    console.log("snp type selected:",snpLabel)
    let results = await functions.filterUsers(snpLabel, users)
    output.snp = results
    console.log("output",output)
    
        // add download button for pgsIds
        functions.createButton("snp","snpButton", `download ${results.length} "${snpLabel}" users`, results);
})

//plot openSNP phenotypes -----------------------------------------------
let phenotypesUrl = 'https://opensnp.org/phenotypes.json'
let phenotypes = await userPhenotypes.getItem(phenotypesUrl); // check for users in localstorage
if (phenotypes == null) {
   phenotypes = (await (await fetch(cors+phenotypesUrl)).json())
                    .sort((a, b) => b.number_of_users - a.number_of_users)
        userPhenotypes.setItem(phenotypesUrl, phenotypes)
}

let snpPhenoDiv = document.getElementById("snpPheno")
var layout = {
    margin: { t:30, b: 320},
    autosize: false,
    height: 650, 
    width: 3500,
   // title: `OpenSNP phenotypes`,
    yaxis: {
        title: {
            text: "Counts"},
        autorange: false,
        range: [0, 1000],
        type: 'linear'
    },
    xaxis:{
        title: {
            standoff: 20,
            text: "Phenotypes"},
            tickfont:{
              //  family:"Times New Roman",
                size : 9
            }
    }
}
var dt = [{
    y: phenotypes.map(x => x.number_of_users),
    x: phenotypes.map(x => x.characteristic),
    type: 'bar',
    orientation: 'v',
    marker: {
        color: Array(phenotypes.length).fill([
            'orange', 'green', 'red',
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
        ]).flat().splice(0, phenotypes.length)
    }
}]
plotly.newPlot(snpPhenoDiv, dt, layout);

snpPhenoDiv.on('plotly_click', async function (data) {

    let phenoLabel = data.points[0].label
    let phenoData = phenotypes.filter( x => x.characteristic == phenoLabel)
    let phenoId = phenoData[0].id
    console.log("phenoId:",phenoId,phenoLabel)


   let  phenotypeUrl = `https://opensnp.org/phenotypes/json/variations/${phenoId}.json`

   let phenotype = await userPhenotype.getItem(phenotypeUrl); // check for users in localstorage
    if (phenotype == null) {
        phenotype = (await (await fetch(cors+phenotypeUrl)).json())
          //.sort((a, b) => b.number_of_users - a.number_of_users)
             userPhenotype.setItem(phenotypeUrl, phenotype)
     }

    let phenotypeUserIds = phenotype.users.map( x => x.user_id)
    var phenotypeUsers = users.filter(({id}) => phenotypeUserIds.includes(id));

    let types = datatypesCounts.map(x => x.filetype)

    let usersPheno = await Promise.all(types.map(async function (type){
        let obj = {}
        let filteredUsers2 = await Promise.all((await functions.filterUsers(type, phenotypeUsers)).map( async (row,i)  => {
   
                await functions.timeout(4000)
                let phenoDataUrl = `https://opensnp.org/phenotypes/json/${row.id}.json`
                let phenoData = await userPhenotype2.getItem(phenoDataUrl); // check for users in localstorage////.phenotypes
                if (phenoData == null) {
                    phenoData = (await (await fetch(cors+phenoDataUrl)).json())
                    userPhenotype2.setItem(phenoDataUrl, phenoData)
                }
                    row["phenotypes"] = await phenoData.phenotypes
            return row
        }))
        obj[type] = filteredUsers2
        return obj
    }))
    console.log("usersPheno : ",usersPheno)

    var layout = {
        title: {
            text:`Users with "${phenoLabel}" data`,
            font: {
            size: 12
            }
        },
        height: 420,
        width: 420
    }
    var data = [{
        values: usersPheno.map( x=> Object.values(x)[0].length),
        labels: types,
        type: 'pie',
        textposition: 'inside'
    }];

    plotly.newPlot('snpPhenoPie', data, layout);
    document.getElementById("snpPhenoPie").on('plotly_click', async function (data2) {
        let trait = data2.points[0].label
        let pieData = usersPheno.filter( x => Object.keys(x) == trait)

        console.log("pieData for ",phenoLabel, pieData)

        let pieIds = [...new Set(Object.values(pieData[0])[0].map(x=>x.id))]

        console.log("pieData for ",pieIds)
        //Get all phenotypes from a specific user(-ID)
        var pieUsers = users.filter(({id}) => pieIds.includes(id));
        console.log(" pieUsers ",pieUsers)

        let allPhenotypes =   pieIds.slice(0,5).map( async x=> {
            console.log("x",x)
        let obj = {}
        let user = (await (await fetch(cors+`https://opensnp.org/phenotypes/json/${x}.json`)).json()).phenotypes
        obj[x] = user
        return obj        
        })
        console.log(" allPhenotypes ",allPhenotypes)
        functions.createButton("snpPhenoPieButton","button0", `download ${pieData[0][trait].length} users`,pieData[0][trait]);
    })
})



// top bar plot
// PGS ///////////////////////////////////////////////////////////////////////////////////
const traitFiles = (await functions.fetchAll2('https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
const traits = Array.from(new Set(traitFiles.flatMap(x => x["trait_categories"])
    .sort().filter(e => e.length).map(JSON.stringify)), JSON.parse)
traits.map(x => functions.getAllPgsIdsByCategory(x))

// top bar plot of PGS entries by category--------------------------------------------------------------------------------
let allTraitsDt = (await functions.traitsData(traits)).sort(function (a, b) {
    return b.count - a.count
});
let topBarCategoriesDiv = document.getElementById("topBarCategories")
var layout = {
    height: 500,
    width: 400,
    autosize: false,
   // title: `Counts of PGS entries across ${allTraitsDt.length} Categories`,
     margin: {
       b: 220
    },

    yaxis: {
        title: {
            text: 'Category Counts',
          },
              autorange: false,
        range: [0, 150],
        type: 'linear'
    },
    xaxis:{      tickfont:{
        size : 11
    },}
}
var dt = [{
    x: allTraitsDt.map(x => x.trait),
    y: allTraitsDt.map(x => x.count),
    type: 'bar',
    //orientation: 'h',
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
let traitList = traitFiles.sort((a, b) => b.associated_pgs_ids.length - a.associated_pgs_ids.length)
var layout = {
    autosize: false,
    height: 700,
    width: 8000,
   // title: `Counts of PGS entries across ${traitList.length} Traits`,
    margin: {
       // t: 200,
        b: 400
    },
    yaxis: {
        title: {
            text: 'Trait Counts',
          },
          constraintoward: 'left',

        autorange: false,
        range: [0, 100],
        type: 'linear'
    },
    xaxis:{      tickfont:{
        size : 9
    },}
  
}

var dt = [{
    x: traitFiles.map(x => x.label),
    y: traitFiles.map(x => x.associated_pgs_ids.length),
    type: 'bar',
    //orientation: 'h',
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


// bar chart of variant sizes after click-----------------------------------------
topBarCategoriesDiv.on('plotly_click', async function (data) {
    let category = data.points[0].label
    console.log("Category selected:",category)

    let pgsIds = functions.getAllPgsIdsByCategory(category)
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)

    output.pgs[category+" scorefiles"] - scoreFiles
    console.log(" output.pgs", output.pgs)

    var obj2 = {};
    scoreFiles.forEach(function (item) {
        obj2[item.trait_reported] ? obj2[item.trait_reported]++ : obj2[item.trait_reported] = 1;
    });
    
    document.getElementById("description1").innerHTML = `"${category}" category: ${Object.values(obj2).length} traits with a total of ${pgsIds.length} entries found!`

    var layout = {
        autosize: true,
        height: 400,
        width: 600,
        title: `Variant sizes for ${pgsIds.length} "${category}" entries `,
        margin: {l: 390 },

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
    plotly.newPlot('secondBarCategories', data, layout)
    functions.createButton("secondBarCategories","button1", `download ${pgsIds.length} pgs IDs`,pgsIds);
    //
    functions.createButton2("betasBarCategoriesButton","button1_2", `plot betas`);

    //plotBetas(category, scoreFiles,'betasBarCategories',"button1_2")
   // plot betas
       // save texts for small models (<350 variants)
       let txts = []
       let pgsIds350 = scoreFiles.filter( x => x.variants_number <350).map(x=>x.id)
       pgsIds350.map(async x => txts.push((await sdk.loadScoreHm(x))) )
       output.pgs[`txts ${category} 350 var`] = txts
        document.getElementById('button1_2').addEventListener('click', function(event) {
        let traces = {}
        txts.map( x => {
            let chr = x.cols.indexOf("hm_chr")
            let pos = x.cols.indexOf("hm_pos")
            let weight = x.cols.indexOf("effect_weight")
            let obj = {};
                x.dt.map( e=> obj[e[chr]+"_"+e[pos]] = e[weight])
                traces[x.id] = obj
            })
        output.pgs[`plot ${category} 350 var`] = traces
        console.log( "output.pgs",output.pgs)

        let plotData=  Object.keys(traces).map( x =>{
            let obj = {
            "y": Object.values(traces[x]),
            "x": Object.keys(traces[x]),
            "type": 'bar',
            "opacity": 0.65,
            "name":x,
            }
            return obj
        } )
       // console.log( "plotData",plotData.map( x => x.y).flat())//.sort((a,b) => a.x - b.x))  
        let betas = plotData.map( x => x.y).flat()  
        var layout = {
            "barmode": 'overlay', 
            title: `betas for ${pgsIds350.length} "${category}" entries with < 350 variants`,
            height: 1000,
            //  width: (txts.length*170)/(0.2),
            xaxis:{
                title: {
                    standoff: 5,
                    text: "chromosome_position"},
            },
        margin: {l:5,b: 200 },
            yaxis: {title: {
                standoff: 10,
                text: "beta"}, 
                range: [betas.sort((a, b) => a - b)[0], betas.sort((a, b) => b - a)[0]]},
            showlegend: true,
            legend: {x: -0.09, y: 1}
            }
    plotly.newPlot('betasBarCategories', plotData,layout,{showSendToCloud: true});
    
    })
})

// plot betas function
// const plotBetas =  async function(category,scoreFiles,div,button){
//     document.getElementById(button).addEventListener('click',  async function(event) {

//   // save texts for small models (<200 variants)
//   let txts = []
//   let pgsIds200 = scoreFiles.filter( x => x.variants_number <200).map(x=>x.id)
//   console.log( "pgsIds200", pgsIds200)

//  let dt = pgsIds200.map(async x => {
//     console.log( "x", x)
//     let dt = await sdk.loadScoreHm(x)
//     //console.log( "dt", dt)
//         txts.push(dt)
//         console.log("txts----", txts)
//         return dt
//     } )
//     console.log( "dt", dt)

//   let obj = {}
//   obj[category+" texts"] =  txts
//   output.pgs.push(obj)
//   let traces = {}

// dt.map( async function (x) {
//         console.log("x", x);
//         let data = await x
//         let chr = data.cols.indexOf("hm_chr");
//         let pos = data.cols.indexOf("hm_pos");
//         let weight = data.cols.indexOf("effect_weight");
//         let obj = {};
//         data.dt.map(e => obj[e[chr] + "_" + e[pos]] = e[weight]);
//         traces[data.id] = obj;
//         console.log("traces", traces);
//     })
//     console.log( "Object.keys( traces)",  Object.keys( traces))

//     let plotData=   pgsIds200.map(async function(x){
//         let x2 =   x
//         let traces2 = traces
//         console.log(traces2)
//         let obj =  {
//         "y": Object.values(await traces[x2]),
//         "x": Object.keys(await traces[x2]),
//         "type": 'bar',
//         "opacity": 0.65,
//         "name":x,
//         }
//         return obj
//     } )
//     console.log( "plotData",plotData.map( x => x.y).flat())//.sort((a,b) => a.x - b.x))  
//     let betas = plotData.map( x => x.y).flat()  
// var layout = {
//     "barmode": 'overlay', 
//     title: `betas for ${pgsIds200.length} "${category}" entries with < 200 variants`,
//       height: 1000,
//     //  width: (txts.length*170)/(0.2),
//     xaxis:{
//         title: {
//             standoff: 5,
//             text: "chromosome_position"},
//     },
//    margin: {l:5,b: 200 },
//      yaxis: {title: {
//         standoff: 10,
//         text: "beta"}, 
//         range: [await betas.sort((a, b) => a - b)[0], await betas.sort((a, b) => b - a)[0]]},
//     showlegend: true,
//     legend: {x: -0.09, y: 1.1}
//     }
// plotly.newPlot(div, plotData,layout,{showSendToCloud: true});
//     })
// }
// pie chart of traits -----------------------------------
topBarCategoriesDiv.on('plotly_click', async function (data) {
    var spinner = document.getElementById("spinner2");
    spinner.style.display = "block";
    let category = data.points[0].label
    const newH = document.getElementById("pieHeader");
    newH.innerHTML = `Select a "${category}" trait below`
    newH.style = "color: rgb(6, 137, 231);"
    let pgsIds = functions.getAllPgsIdsByCategory(category)
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)

    var obj = {};
    scoreFiles.forEach(function (item) {
        obj[item.trait_reported] ? obj[item.trait_reported]++ : obj[item.trait_reported] = 1;
    });
    var layout = {
        title: `${Object.keys(obj).length} traits found in "${category}" Category`,
        autosize: true,
    }
    var data = [{
        values: Object.values(obj),
        labels: Object.keys(obj),
        type: 'pie',
        textposition: 'inside'
    }];

    plotly.newPlot('pgsPie', data, layout);

   spinner.style.display = "none";

    // bar chart of variant size by trait from pie selection------------------------
    document.getElementById("pgsPie").on('plotly_click', async function (data2) {
        let trait = data2.points[0].label
        console.log("Subcategory selected:",trait)
        let res = scoreFiles.filter(x => x.trait_reported === trait).sort((a, b) => a.variants_number - b.variants_number)
     
        output.pgs[trait+" scorefiles"] = res
        console.log(" output.pgs", output.pgs)
        var data = [{
            x: res.map(x => x.variants_number),
            y: res.map(x => x.trait_reported.concat(" " + x.id)),
            type: 'bar',
            orientation: 'h',
            marker: {
                color: data2.points[0].color,
            }
        }];
        var layout = {
            autosize: true,
            title: `Variant sizes ${res.length} "${trait}" entries`,
            margin: {
                l: 250
            },
            xaxis: {
                autorange: false,
                range: [0, 500],
                type: 'linear'
            },
        }
        plotly.newPlot('thirdBarCategories', data, layout);

        // add download button for pgsIds
        functions.createButton("thirdBarCategories","button2", `download ${res.length} pgs IDs`,res.map(x => x.id));
        functions.createButton2("betasthirdBarCategoriesButton","button1_3", `plot betas`);

       // plot betas
           // save texts for small models (<350 variants)
           let txts = []
           let pgsIds350 = res.filter( x => x.variants_number <350).map(x=>x.id)
           pgsIds350.map(async x => txts.push((await sdk.loadScoreHm(x))) )
           output.pgs[`txts ${trait} 350 var`] = txts
            document.getElementById('button1_3').addEventListener('click', function(event) {
            let traces = {}
            txts.map( x => {
                let chr = x.cols.indexOf("hm_chr")
                let pos = x.cols.indexOf("hm_pos")
                let weight = x.cols.indexOf("effect_weight")
                let obj = {};
                    x.dt.map( e=> obj[e[chr]+"_"+e[pos]] = e[weight])
                    traces[x.id] = obj
                })
            output.pgs[`plot ${trait} 350 var`] = traces
            console.log( "output.pgs",output.pgs)
    
            let plotData=  Object.keys(traces).map( x =>{
                let obj = {
                "y": Object.values(traces[x]),
                "x": Object.keys(traces[x]),
                "type": 'bar',
                "opacity": 0.65,
                "name":x,
                }
                return obj
            } )
           // console.log( "plotData",plotData.map( x => x.y).flat())//.sort((a,b) => a.x - b.x))  
            let betas = plotData.map( x => x.y).flat()  
            var layout = {
                "barmode": 'overlay', 
                title: `betas for ${pgsIds350.length} "${trait}" entries with < 350 variants`,
                height: 1000,
                //  width: (txts.length*170)/(0.2),
                xaxis:{
                    title: {
                        standoff: 5,
                        text: "chromosome_position"},
                },
            margin: {l:5,b: 200 },
                yaxis: {title: {
                    standoff: 10,
                    text: "beta"}, 
                    range: [betas.sort((a, b) => a - b)[0], betas.sort((a, b) => b - a)[0]]},
                showlegend: true,
                legend: {x: -0.09, y: 1.1}
                }
        plotly.newPlot('betasthirdBarCategories', plotData,layout,{showSendToCloud: true});
        })
    })
})

//bar chart of traits -----------------------------------------
topBarTraitsDiv.on('plotly_click', async function (data) {
    var spinner = document.getElementById("spinner3");
    spinner.style.display = "block";

    let trait = data.points[0].label
    console.log("Trait selected:",trait)
    let pgsIds = traitFiles.filter(tfile => tfile.label == trait)[0].associated_pgs_ids
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    output.pgs[trait+" scorefiles"] - scoreFiles
    console.log(" output.pgs", output.pgs)

    var layout = {
        autosize: true,
        title: `Variant sizes for ${pgsIds.length} "${trait}" entries `,
        margin: {
            l: 390
        },
        xaxis: {
            autorange: false,
            range: [0, 500],
            type: 'linear',
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
    spinner.style.display = "none";

            // plot betas
            functions.createButton("secondBarTraitsButton","button3",`download ${scoreFiles.length} pgs IDs`, scoreFiles.map(x => x.id));
            functions.createButton2("betassecondBarTraitsButton","button3_2", `plot betas`);

            // save texts for small models (<350 variants)
           let txts = []
           let pgsIds350 = scoreFiles.filter( x => x.variants_number <350).map(x=>x.id)
           pgsIds350.map(async x => txts.push((await sdk.loadScoreHm(x))) )
           output.pgs[`txts ${trait} 350 var`] = txts
            document.getElementById('button3_2').addEventListener('click', function(event) {
            let traces = {}
            txts.map( x => {
                let chr = x.cols.indexOf("hm_chr")
                let pos = x.cols.indexOf("hm_pos")
                let weight = x.cols.indexOf("effect_weight")
                let obj = {};
                    x.dt.map( e=> obj[e[chr]+"_"+e[pos]] = e[weight])
                    traces[x.id] = obj
                })
            output.pgs[`plot ${trait} 350 var`] = traces
            console.log( "output.pgs",output.pgs)
    
            let plotData=  Object.keys(traces).map( x =>{
                let obj = {
                "y": Object.values(traces[x]),
                "x": Object.keys(traces[x]),
                "type": 'bar',
                "opacity": 0.65,
                "name":x,
                }
                return obj
            } )
           // console.log( "plotData",plotData.map( x => x.y).flat())//.sort((a,b) => a.x - b.x))  
            let betas = plotData.map( x => x.y).flat()  
            var layout = {
                "barmode": 'overlay', 
                title: `betas for ${pgsIds350.length} "${trait}" entries with < 350 variants`,
                height: 1000,
                //  width: (txts.length*170)/(0.2),
                xaxis:{
                    title: {
                        standoff: 5,
                        text: "chromosome_position"},
                },
            margin: {l:5,b: 200 },
                yaxis: {title: {
                    standoff: 55,
                    text: "beta values"}, 
                    range: [betas.sort((a, b) => a - b)[0], betas.sort((a, b) => b - a)[0]]},
                showlegend: true,
                legend: {x: -0.09, y: 1}
                }
        plotly.newPlot('betassecondBarTraits', plotData,layout,{showSendToCloud: true});
        })
    })


