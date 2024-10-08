import {
    getPgs
} from "./getPgs.js"
import {
    get23
} from "./get23.js"
import {
    plotly
} from "../dependencies.js";
import {
    PRS
} from "./prs.js"
import localforage from 'https://cdn.skypack.dev/localforage';

// NOtes: I have to run the calc on QC passed users and pgs entries. Then, I run the calc
// and filter the prs that did not have matches.
let pgsCategories = localforage.createInstance({
    name: "pgsCategories",
    storeName: "pgsCategories"
})

let userPhenotypes = localforage.createInstance({
    name: "userPhenotypes",
    storeName: "userPhenotypes"
})

// document.getElementById("prsButton").addEventListener("click", async function (e) {
//     console.log("loading ui.js")
// })
const traits = await getPgs.traits()
// console.log("traits",traits)
// SELECT PGS CATEGORY
const ui = async function (targetDiv) {

    targetDiv = document.getElementById(targetDiv)



    let pgsDiv = document.createElement('div')
    targetDiv.appendChild(pgsDiv)
    pgsDiv.id = 'pgsDiv1'
    pgsDiv.innerHTML = `
    <p>Select a PGS Category:</p>`

    const dt = {}
    // we need to define pgs categories and user phenotypes functions in the UI or it's slow to load from another page
    let categories
    categories = await pgsCategories.getItem("categories")
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
        if (x.label == "Cancer") {
            op.defaultSelected = "Cancer"
        }
        op.value = x.label;
        op.text = x.label;
        dropdown.options.add(op)
    })

    // Add the dropdown to the div
    pgsDiv.appendChild(dropdown);

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
    let UserDiv = document.createElement('div')
    targetDiv.appendChild(UserDiv)
    UserDiv.id = 'userDiv1'
    UserDiv.innerHTML = `
    <br><p>Select a user Category:</p>`
    // Create the dropdown (select) element
    const dropdown2 = document.createElement("select");
    dropdown2.id = "userSelect"
    // Create options and add them to the dropdown

    phenotypes.map(x => {
        const op = new Option();
        if (x.characteristic == "Cervical dysplasia / cancer") {
            op.defaultSelected = "Cervical dysplasia / cancer"
        }
        op.value = x.characteristic;
        op.text = x.characteristic;
        dropdown2.options.add(op)
    })
    dt.users = {}

    UserDiv.appendChild(dropdown2);
    UserDiv.innerHTML += "<br>";
    UserDiv.appendChild(document.createElement("br"))



    var prsButton = document.createElement("button");
    prsButton.id = "prsButton1"
    prsButton.innerHTML = `Calculate`
    UserDiv.appendChild(prsButton);


    document.getElementById("prsButton1").addEventListener("click", async function (e) {
        console.log("loading.......")
        var plotDiv = document.createElement("div");
        plotDiv.id = "plotDiv"
        plotDiv.innerHTML = "Loading..."

        UserDiv.appendChild(plotDiv);
        // DROPDOWN 23andme users ///////////////////////////////////////////////////////////

        const phenotypeLabel = document.getElementById("userSelect").value //e.target.value
        const phenotypeId = await get23.getPhenotypeIdFromName(phenotypeLabel)
        const userTxts = (await get23.userTxtsByPhenotypeId(phenotypeId, keysLen, maxKeys)).filter(x => x.qc == true)
        console.log("await get23.userTxtsByPhenotypeId: ", phenotypeLabel, userTxts)

        dt.users.phenotypeLabel = phenotypeLabel
        dt.users.phenotypeId = phenotypeId
        dt.users.txts = userTxts

        //TODO, make dropdown select onchange reversable
        dt.pgs = {}
        const category = document.getElementById("pgsSelect").value
        console.log("PGS category selected: ", e.target.value)
        // TODO slice the pgs entries that are <500
        let pgsIds = (await (getPgs.idsFromCategory(category))).sort().slice(1, 9)

        console.log("pgsIds", pgsIds)
        let pgsTxts = (await Promise.all(pgsIds.map(async x => {
            let res = await getPgs.loadScoreHm(x)
            return res
        }))).filter(item => item);
        console.log("pgsTxts", pgsTxts)

        dt.pgs.category = category
        dt.pgs.txts = pgsTxts

        //calculate prs    
        let prsDt = await PRS.calc(dt)
        dt.prs = prsDt
        console.log("results: ", prsDt)
        console.log("dt: ", dt)

        // plot-------------------------------------------------

        var layout = {
            showlegend: true,
            autosize: false,
            height: 900,
            width: 800,
            title: `PRS scores`,
            yaxis: {
                title: {
                    text: "PRS"
                },
            },
            xaxis: {
                title: {
                    text: "Users"
                },
            },
            margin: {
                b: 440
            }
        }

        // reverse look up the PRS matrix to fill the traces
        let traces = {}

        dt.pgs.txts.map((x, i) => {
            // console.log("i",i)
            let idx = i

            let arr = []
            // let snpTxts2 = snpTxts.filter(x=> x.meta.split(/\r?\n|\r|\n/g)[0].slice(-4) > 2010)

            dt.users.txts.map(y => {
                arr.push(dt.prs[idx])
                idx += dt.pgs.txts.length
                // console.log("idx",idx)
            })
            traces[dt.pgs.txts[i].id] = arr
        })
        // console.log("traces", traces)
        let plotData = Object.keys(traces).map((x, i) => {
            let obj = {
                y: traces[x].map(x => x.PRS),
                x: traces[x].map(x => {
                    let monthDay = x.users.meta.split(/\r?\n|\r|\n/g)[0].slice(-20, -14)
                    let year = x.users.meta.split(/\r?\n|\r|\n/g)[0].slice(-4)
                    let xlabel = x.users.openSnp.variation + ", name: " + x.users.openSnp.name + " , Date: " + monthDay + " " + year
                    return xlabel
                }),
                mode: 'lines+markers',
                opacity: 0.80,
                hoverinfo: "y",
                name: x + ": " + dt.pgs.txts[i].meta.variants_number + " variants",
            }
            return obj
        })
        plotDiv.innerHTML = ''
        plotly.newPlot(plotDiv, plotData, layout);
        // })
    });

    // document.getElementById("prsButton").addEventListener("click", async (e) => {

    //     console.log("User category selected: ", document.getElementById("userSelect").value)
    //     const phenotypeLabel = document.getElementById("userSelect").value // e.target.value
    //     const phenotypeId = await get23.getPhenotypeIdFromName(phenotypeLabel)
    //     console.log("phenotypeId", phenotypeId)
    //     const userTxts = (await get23.userTxtsByPhenotypeId(phenotypeId, keysLen, maxKeys)).filter(x => x.qc == true)
    //     console.log("userTxts", userTxts)

    //     // dt.users.phenotypes = phenotypes
    //     dt.users.phenotypeLabel = phenotypeLabel
    //     dt.users.phenotypeId = phenotypeId
    //     dt.users.txts = userTxts

    //     // TODO add onlcick button for prsc calculation
    //     // SAVE PGS AND 23me DATA IN DT OBJ///////////////////////////
    //     // create input matrix for prs.calc
    //     let data = {}
    //     data.PGS = dt.pgs.txts
    //     data.my23 = dt.users.txts //x.year > "2011" & 
    //     console.log("data", data)

    //     //calculate prs    
    //     let prsDt = await PRS.calc(data)
    //     data.PRS = prsDt.prs

    //     prsDt.pgs.category = category
    //     // if prs qc failes for one user, remove the connected pgs entry
    //     console.log("results: ", prsDt)

    //     // plot PRS --------------------------------------------------------------------
    //     var prsDiv = document.createElement("div");
    //     prsDiv.id = "prsDiv"
    //     div2.appendChild(prsDiv);

    //     var layout = {
    //         showlegend: true,
    //         autosize: false,
    //         height: 900,
    //         width: 800,
    //         title: `PRS scores`,
    //         yaxis: {
    //             title: {
    //                 text: "PRS"
    //             },
    //         },
    //         xaxis: {
    //             title: {
    //                 text: "Users"
    //             },
    //         },
    //         margin: {
    //             b: 440
    //         }
    //     }

    //     // reverse look up the PRS matrix to fill the traces
    //     let traces = {}
    //     data.PGS.map((x, i) => {
    //         let arr = []
    //         let idx = i
    //         // let snpTxts2 = snpTxts.filter(x=> x.meta.split(/\r?\n|\r|\n/g)[0].slice(-4) > 2010)

    //         data.my23.map(y => {
    //             arr.push(data.PRS[idx])
    //             idx += data.PGS.length
    //         })
    //         traces[data.PRS[i].pgsId] = arr
    //     })
    //     //console.log("traces",traces)
    //     let plotData = Object.keys(traces).map((x, i) => {
    //         let obj = {
    //             y: traces[x].map(x => x.PRS),
    //             x: traces[x].map(x => {
    //                 let monthDay = x.my23meta.split(/\r?\n|\r|\n/g)[0].slice(-20, -14)
    //                 let year = x.my23meta.split(/\r?\n|\r|\n/g)[0].slice(-4)
    //                 // TODO add variation to data
    //                 let phenotypeVariation = x.openSnp.id //[output.userPhenotype]["variation"]
    //                 let xlabel = phenotypeVariation + "_" + x.openSnp.name + "_" + "ID" + "_" + x.my23Id + "_" + year + "_" + monthDay
    //                 return xlabel
    //             }),
    //             mode: 'lines+markers',
    //             opacity: 0.80,
    //             hoverinfo: "y",
    //             name: x + ": " + data.PGS[i].meta.variants_number + " variants",
    //         }
    //         return obj
    //     })
    //     plotly.newPlot(prsDiv, plotData, layout);
    // })

}

ui("prsDiv")

export {
    ui
}
