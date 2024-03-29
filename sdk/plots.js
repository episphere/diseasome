import { plotly} from "../dependencies.js";
import {functions} from "./main.js"

let output = {pgs:[], snp:[]}
// plot opensnp data types --------------
//functions.removeLocalStorageValues('request', pgs)

let users = (await functions.getUsers())
let usersFlat = users.flatMap(x=>x.genotypes)
let datatypes = [...new Set(users.flatMap(x=>x.genotypes.flatMap(e=>e.filetype)))]
// console.log("usersFlat",usersFlat)
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
// console.log("datatypes:",datatypesCounts)

// plot openSNP------------------------------------------------------------
let snpDiv = document.getElementById("snp")
var layout = {
    autosize: false,
    height: 300, 
    width: 400,
    title: `OpenSNP datatypes`,
 margin: {l:150},
    xaxis: {
        autorange: false,
        range: [0, 1000],
        type: 'linear'
    },
    yaxis:{
        title: {
            standoff: 10,
            text: "Counts"},
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
    let snpUrls = results.map( x => x["genotype.download_url"])
    
        // add download button for pgsIds
        functions.createButton("snp","snpButton", "download snp urls", snpUrls);
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
    width: 600,
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
        range: [0, 300],
        type: 'linear'
    },
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
    width: 12000,
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
    console.log("data.points[0]",data.points[0])
    let category = data.points[0].label
    console.log("Category selected:",category)

    let pgsIds = functions.getAllPgsIdsByCategory(category)
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    let obj = {}
    obj[category] = scoreFiles
    output.pgs.push(obj)
    console.log("output",output)
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
        margin: {
            l: 390,
            r: 0,
            t: -10,
            b: -10
        },

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
    functions.createButton("secondBarCategories","button1", "download pgs IDs",scoreFiles);
})

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
        let obj = {}
        obj[trait] = res
        output.pgs.push(obj)
        console.log("output",output)
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
        functions.createButton("thirdBarCategories","button2", "download pgs IDs",res);
    })
})

//bar chart of traits -----------------------------------------
topBarTraitsDiv.on('plotly_click', async function (data) {
    let trait = data.points[0].label
    console.log("Trait selected:",trait)
    let pgsIds = traitFiles.filter(tfile => tfile.label == trait)[0].associated_pgs_ids
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    let obj = {}
    obj[trait] = scoreFiles
    output.pgs.push(obj)
    console.log("output",output)

    var layout = {
        autosize: true,
        title: `Variant sizes for ${pgsIds.length} "${trait}" entries `,
        margin: {
            l: 390
        },
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
    // add download button for pgsIds
     // add download button for pgsIds
     functions.createButton("secondBarTraits","button3","download pgs IDs", scoreFiles);
  })


