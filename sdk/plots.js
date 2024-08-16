import { plotly} from "../dependencies.js";
import {functions} from "./main.js"
import {sdk} from "./sdk.js"
import {PRS} from "./prs.js"
import localforage from 'https://cdn.jsdelivr.net/npm/localforage@1.10.0/+esm'//'https://cdn.skypack.dev/localforage';
localforage.config({
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ], name: 'localforage'
});


let singleUserAllPhenotypesTable = localforage.createInstance({name: "openSnpDb2",storeName: "singleUserAllPhenotypesTable"})
let phenotypesTable = localforage.createInstance({name: "openSnpDb",storeName: "phenotypesTable"})
let phenotypeUsersTable = localforage.createInstance({name: "openSnpDb",storeName: "phenotypesTable"})
let filetypesTable = localforage.createInstance({name: "openSnpDb",storeName: "filetypesTable"})
let filetypeCountsTable = localforage.createInstance({name: "openSnpDb",storeName: "filetypeCountsTable"})


let cors = `https://corsproxy.io/?`

const output = {pgs:[], snp:[]}
// plot opensnp data types --------------
//functions.removeLocalStorageValues('request', pgs)

// get openSNP users with genotype data
let openSnpUsers = (await functions.getUsers())
////console.log("openSnpUsers",openSnpUsers.slice(0,9))

// define list of filetypes ("23andme", "ancestry", etc)
let filetypes = await filetypesTable.getItem("filetypes");
////console.log("filetypes",filetypes)
if(filetypes == null ){
    let filetypes = [...new Set(openSnpUsers.flatMap(x=>x.genotypes).map( x => x.filetype))] 
    filetypesTable.setItem("filetypes", filetypes)
}

let openSnpUsers2 = (await Promise.all(filetypes.map( async x => {
    let dt = await functions.filterUsers(x, openSnpUsers)
    return dt
}))).flat()

let filetypeCounts = await filetypeCountsTable.getItem("filetypeCounts");

if(filetypeCounts == null ){
    filetypeCounts = {}
    openSnpUsers2.map(  x => {
        filetypeCounts[x['genotype.filetype']] = (filetypeCounts[x['genotype.filetype']] || 0) + 1
})    
////console.log("filetypeCounts",filetypeCounts)
 filetypeCountsTable.setItem("filetypeCounts", filetypeCounts)
}


// plot openSNP------------------------------------------------------------
let snpDiv = document.getElementById("snp")
var layout = {
    autosize: false,
    height: 300, 
    width: 400,
    title: `OpenSNP fileTypes`,
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
    x: Object.values(filetypeCounts),
    y: Object.keys(filetypeCounts),
    type: 'bar',
    orientation: 'h',
    marker: {
        color: Array(Object.values(filetypeCounts).length).fill([
            'blue', "goldenrod", "magenta",
            '#8c564b', //chestnut brown
            '#9467bd', //muted purple
            'red', //raspberry yogurt pink
            'green', //middle gray
        ]).flat().splice(0, Object.values(filetypeCounts).length)
    }
}]
plotly.newPlot(snpDiv, dt, layout);

// download button for opensnp data---------------------------------
snpDiv.on('plotly_click', async function (data) {
    let snpLabel = data.points[0].label
    //console.log("snp type selected:",snpLabel)
    let results = await functions.filterUsers(snpLabel, openSnpUsers)
    output.snp = results
    //console.log("output snpDiv",output)
    
        // add download button for pgsIds
        functions.createButton("snp","snpButton", `download ${results.length} "${snpLabel}" users`, results);
})

//plot openSNP phenotypes -----------------------------------------------
let phenotypesUrl = 'https://opensnp.org/phenotypes.json'
let phenotypes = await phenotypesTable.getItem(phenotypesUrl); // check for users in localstorage
if (phenotypes == null) {
   phenotypes = (await (await fetch(cors+phenotypesUrl)).json())
                    .sort((a, b) => b.number_of_users - a.number_of_users)
                    phenotypesTable.setItem(phenotypesUrl, phenotypes)
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
    //console.log("data:",data)

    let phenoLabel = data.points[0].label
    let phenoData = phenotypes.filter( x => x.characteristic == phenoLabel)
    let phenoId = phenoData[0].id
    output.userPhenotype = phenoLabel
    //console.log("phenotype selected:",phenoId,phenoLabel)

   let  phenotypeUrl = `https://opensnp.org/phenotypes/json/variations/${phenoId}.json`

   let users = await phenotypeUsersTable.getItem(phenotypeUrl); // check for users in localstorage
    if (users == null) {
        users = (await (await fetch(cors+phenotypeUrl)).json())
          //.sort((a, b) => b.number_of_users - a.number_of_users)
             phenotypeUsersTable.setItem(phenotypeUrl, users)
     }
     //console.log("users:",users)

    let userIds = users.users.map( x => x.user_id)

    // get users with phenotype data (even those without genotype data)
    var phenotypeUsers = openSnpUsers.filter(({id}) => userIds.includes(id));
    //console.log("# of users with this phenotype = :",phenotypeUsers.length)
    //console.log("phenotypeUsers:",phenotypeUsers)

  // retreive phenotype information for each user by filetype
    let usersPheno = await Promise.all(filetypes.map(async function (type){
        let obj = {}
                // filter users with genotype data, with 1 or more genotype files (ie. 3 23andme files)
        let filteredUsers2 = await Promise.all(
                            (await functions.filterUsers(type, phenotypeUsers)).map( async (row,i)  => {
                // console.log(' type, phenotypeUsers',type, phenotypeUsers)
                // console.log(' filterUsers row,i',row,i)
                                

                let url = `https://opensnp.org/phenotypes/json/${row.id}.json`
                // console.log("url",url)

                let phenoData = await singleUserAllPhenotypesTable.getItem(url); // check for users in localstorage////.phenotypes
                await functions.timeout(3000)

                if (phenoData == null) {

                    phenoData = await ( (await fetch(cors+url))).json()
                    // console.log("phenoData",phenoData)

                    await functions.timeout(3000)
                    singleUserAllPhenotypesTable.setItem(url, phenoData)
                }
               // //console.log(`getting ids for ${phenoLabel}`,row.id)
                row["phenotypes"] = await phenoData.phenotypes
                return row
        }))
        //console.log("filteredUsers2:",filteredUsers2)

        obj[type] = filteredUsers2

        return obj
    }))

    console.log("usersPheno",usersPheno)
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
        labels: filetypes,
        type: 'pie',
        textposition: 'inside'
    }];

    plotly.newPlot('snpPhenoPie', data, layout);
    document.getElementById("snpPhenoPie").on('plotly_click', async function (data2) {
        let type = data2.points[0].label
        let usersData = Object.values(usersPheno.filter(x=>Object.keys(x)==type)[0])[0]
        //console.log("type: ",type)
       
        console.log("usersData: ",usersData)

        output.snp[`${phenoLabel}`]= [{"userInfo":usersData}]
        //console.log("output.snp",output.snp)
        functions.createButton("snpPhenoPieButton","button0", `download ${usersData.length} users`,usersData);

    // get 23 and me texts from urls
    let snpTxts = await functions.get23(usersData.slice(20,33))//)snpUrls)
    //console.log("snpTxts:",snpTxts)

    // qc: remove 23txts with older chips
   // //console.log("snpTxts",snpTxts)

  //  //console.log("snpTxts",snpTxts.map(x=> x.openSnp.phenotypes["Type II Diabetes"]))
    //   //console.log("arr23Txts",arr23Txts.map(x=> x.openSnp.phenotypes['Type II Diabetes']))
    let snpTxts2 = snpTxts.filter(x=> x.meta.split(/\r?\n|\r|\n/g)[0].slice(-4) > 2011)

    // //console.log("snpTxts:",snpTxts2)
    // //console.log("snpTxts phenotypes:",snpTxts2.map(x=> x.openSnp.phenotypes["Type II Diabetes"]))

    //output.snp[`${phenoLabel}`].push({"userTxts":snpTxts})
    output["my23"] = snpTxts2
    })
})


// PGS ////////////////////////////////////////////////////////////////////////////////////////////////////
const traitFiles = (await functions.fetchAll2('https://www.pgscatalog.org/rest/trait/all')).flatMap(x => x)
const traits = Array.from(new Set(traitFiles.flatMap(x => x["trait_categories"])
    .sort().filter(e => e.length).map(JSON.stringify)), JSON.parse)
traits.map(x => functions.getAllPgsIdsByCategory(x))


// first bar plot of PGS entries by category--------------------------------------------------------------------------------
let allTraitsDt = (await functions.traitsData(traits)).sort(function (a, b) {
    return b.count - a.count
});
let topBarCategoriesDiv = document.getElementById("topBarCategories")
var layout = {
    height: 500,
    width: 500,
    autosize: false,
   // title: `Counts of PGS entries across ${allTraitsDt.length} Categories`,
    margin: {t:5, b: 200},
    yaxis: {
        title: {
            text: 'Category Counts',
          },
              autorange: true,
        range: [0,3],
        type: 'log',
       dtick: 1
    },
    xaxis:{      tickfont:{
        size : 12
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
    // height: 700,
     width: 8000,
   // title: `Counts of PGS entries across ${traitList.length} Traits`,
    margin: {
        t: 10,
        b: 250
    },
    yaxis: {
        title: {
            text: 'Trait Counts',
          },
          constraintoward: 'left',

        autorange: false,
        range: [0, 100],
        type: 'linear',
       // dtick: '1'
    },
    xaxis:{      tickfont:{
        size : 10
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
    //console.log("Category selected:",category)

    let pgsIds =  (await (functions.getAllPgsIdsByCategory(category))).sort()
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    output.pgs.scoreFiles = scoreFiles
    output.pgs.id = category
//console.log("output category",output)
    var obj2 = {};
    scoreFiles.forEach(function (item) {
        obj2[item.trait_reported] ? obj2[item.trait_reported]++ : obj2[item.trait_reported] = 1;
    });
    
    document.getElementById("description1").innerHTML = `"${category}" category: ${Object.values(obj2).length} traits with a total of ${pgsIds.length} entries found!`

    var layout = {
        autosize: true,
        height: 500,
        width: 800,
        title: `Variant sizes for ${pgsIds.length} "${category}" entries `,
        margin: {l: 390 },

        xaxis: {
            autorange: true,
            range: [0,8],
            type: 'log',
           dtick: '1'
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
    // betas button
    functions.createButton2("betasBarCategoriesButton","button1_2", `plot betas`);

    // plot betas
    plotBetas(category, scoreFiles, 500, "betasBarCategories", "button1_2")
})

// pie chart of traits -----------------------------------
topBarCategoriesDiv.on('plotly_click', async function (data) {
    var spinner = document.getElementById("spinner2");
    spinner.style.display = "block";
    let category = data.points[0].label
    const newH = document.getElementById("pieHeader");
    newH.innerHTML = `Select a "${category}" trait below`
    newH.style = "color: rgb(6, 137, 231);"
    let pgsIds = await functions.getAllPgsIdsByCategory(category)

    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    var obj = {};
    scoreFiles.forEach(function (item) {
        obj[item.trait_reported] ? obj[item.trait_reported]++ : obj[item.trait_reported] = 1;
    });
    var layout = {
        title: `${Object.keys(obj).length} traits found in "${category}" Category`,
        autosize: false,
        height: 450,
        width: 850,
        showlegend: true,
        legend: {x: 1, y: 0.5}
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
        //console.log("Subcategory selected:",trait)
        let res = scoreFiles.filter(x => x.trait_reported === trait).sort((a, b) => a.variants_number - b.variants_number)
        output.pgs.scoreFiles = res
        output.pgs.id = trait
        // output.pgs[trait+" scorefiles"] = res
        //console.log(" output:", output)
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
            height: 500,
            width: 800,
            title: `Variant sizes for ${res.length} "${trait}" entries`,
            margin: {
                l: 250
            },
            xaxis: {
                autorange: true,
                range: [0, 8],
                type: 'log',
                dtick:1,
            },
        }
        plotly.newPlot('thirdBarCategories', data, layout);

        // add download button for pgsIds
        functions.createButton("thirdBarCategories","button2", `download ${res.length} pgs IDs`,res.map(x => x.id));
        functions.createButton2("betasthirdBarCategoriesButton","button1_3", `plot betas`);

       // plot betas
       plotBetas(trait, res, 500, "betasthirdBarCategories", "button1_3")
    })
})

//bar chart of traits -----------------------------------------
topBarTraitsDiv.on('plotly_click', async function (data) {
    var spinner = document.getElementById("spinner3");
    spinner.style.display = "block";

    let trait = data.points[0].label
    //console.log("Trait selected:",trait)
    let pgsIds = traitFiles.filter(tfile => tfile.label == trait)[0].associated_pgs_ids
    let scoreFiles = (await functions.getscoreFiles(pgsIds)).sort((a, b) => a.variants_number - b.variants_number)
    // output.pgs[trait+" scorefiles"] - scoreFiles
    // //console.log(" output.pgs", output.pgs)

    var layout = {
        autosize: true,
        height: 200 + pgsIds.length*5,
        width: 800,
        title: `Variant sizes for ${pgsIds.length} "${trait}" entries `,
        margin: {
            l: 450
        },
        xaxis: {
            autorange: false,
            range: [0, 8],
            type: 'log',
            dtick: '1'
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

      
          // plot betas
          plotBetas(trait, scoreFiles, 500, "betassecondBarTraits", "button3_2")
        
    })

document.getElementById("selection").data = output


document.getElementById('prsButton').addEventListener('click', async function(event) {
    let data = {}
    data.PGS =  Object.values(output["myPgsTxts"])[0].slice(0,10)//.filter(x => x.qc == "true")

   //console.log('output:', output)
    data.my23 = output["my23"].slice(0,10)
    //console.log("data",data)

    let prsDt = PRS.calc(data)
    data["PRS"] = await prsDt

// plot PRS --------------------------------------------------------------------
let prsDiv = document.getElementById("prsDiv")
var layout = {
    showlegend: true,
    autosize: false,
    height: 900, 
    width: 800,
   title: `PRS scores`,
    yaxis: {
        title: {
            text: "PRS"},
    },
    xaxis:{
        title: {
            text: "Users"},
    },
    margin: {b: 440 }
}

// reverse look up the PRS matrix to fill the traces
let traces = {}
data.PGS.map( (x,i) => {
    let arr = []
    let idx = i
// let snpTxts2 = snpTxts.filter(x=> x.meta.split(/\r?\n|\r|\n/g)[0].slice(-4) > 2010)

    data.my23.map( y => {
        arr.push( data.PRS[idx])
        idx += data.PGS.length
        })
        traces[data.PRS[i].pgsId] = arr
    })
   //console.log("traces",traces)

let plotData=  Object.keys(traces).map( (x, i) =>{
    let obj = {
    y: traces[x].map( x => x.PRS),
    x: traces[x].map( x => {

            let monthDay = x.my23meta.split(/\r?\n|\r|\n/g)[0].slice(-20,-14)
            let year =  x.my23meta.split(/\r?\n|\r|\n/g)[0].slice(-4)
            let phenotypeVariation = x.openSnp.phenotypes[output.userPhenotype]["variation"]
            let xlabel = phenotypeVariation + "_" + x.openSnp.name + "_" +  "ID" +  "_" +  x.my23Id  + "_" +  year + "_" + monthDay
            return xlabel     
            }), 
    mode: 'lines+markers',
    opacity: 0.80,
    hoverinfo:"y",
    name: x + ": "+ data.PGS[i].meta.variants_number + " variants",
    }
    return obj
} )

plotly.newPlot(prsDiv, plotData, layout);
})

//plot pgs catalog betas function and filter by variant number
const plotBetas = async function (category, scoreFiles, var_num ,div, button) {
    document.getElementById(button).addEventListener('click', async function (event) {

        // retreive texts for small models (<200 variants)
        let pgsIds = scoreFiles.filter(x => x.variants_number < var_num).map(x => x.id)
        let txts = await Promise.all(await pgsIds.map(async x => {
            let res = await sdk.loadScoreHm(x)
            return res
        }))

        let obj = {}
        obj[category + " texts"] = txts
        output["myPgsTxts"] = obj
        //console.log('output',output)

        // get variants and betas for each PGS entry
        let data = txts.reduce(function (acc, pgs) {
            let chr = pgs.cols.indexOf("hm_chr");
            let pos = pgs.cols.indexOf("hm_pos");
            let weight = pgs.cols.indexOf("effect_weight");
            let obj = {};
            pgs.dt.map(e => obj[e[chr] + "_" + e[pos]] = e[weight]);
            acc[pgs['id']] = obj
            return acc
        }, {})

        // create a trace for each PGS entry
        let plotData = pgsIds.map(function (x) {

            let obj = {
                "y": Object.values(data[x]),
                "x": Object.keys(data[x]),
                "type": 'bar',
                "opacity": 0.65,
                "name": x,
            }
            return obj
        })
        let betas = plotData.map(x => x.y).flat()
        var layout = {
            "barmode": 'overlay',
            title: `betas for ${pgsIds.length} "${category}" entries with < ${var_num} variants`,
            height: 1000,
            //  width: (txts.length*170)/(0.2),
            xaxis: {
                title: {
                    standoff: 30,
                    text: "chromosome_position"
                },
            },
           
            margin: {l: 130,b: 200 },
            yaxis: {title: {
                //standoff: 5,
                text: "beta values"}, 
                range: [betas.sort((a, b) => a - b)[0], betas.sort((a, b) => b - a)[0]]},
            showlegend: true,
            legend: {x: -0.5, y: 1}
            }
        plotly.newPlot(div, plotData, layout, {
            showSendToCloud: true
        });
    })
}
//
//https://github.com/jonasalmeida/jmat/blob/gh-pages/jmat.js

// memb:function(x,dst){ // builds membership function
// 	var n = x.length-1;
// 	if(!dst){
// 		dst = this.sort(x);
// 		Ind=dst[1];
// 		dst[1]=dst[1].map(function(z,i){return i/(n)});
// 		var y = x.map(function(z,i){return dst[1][Ind[i]]});
// 		return dst;
// 	}
// 	else{ // interpolate y from distributions, dst
// 		var y = this.interp1(dst[0],dst[1],x);
// 		return y;
// 	}
	
// },

export{output}