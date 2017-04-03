import * as superagent from 'superagent';
import { format } from 'util';
import { env as domEnv } from 'jsdom';
import { createWriteStream } from 'fs';
import { toCsvTitle, toCsvTuple, getNumberSeq, heavyTrim, sleep, writeBOM, USER_AGENT } from './helper';
import { FiberPool } from './concurrency';

import {
    formatEstate,
    formatPropertyDetail
} from './formatters';

const SEARCH_LIST_RESULTS = 'http://www.hkp.com.hk/find-property/data/search_list_results';
const DETAIL_LAYER = 'http://app2.hkp.com.hk/cs/detail_layer.jsp?cs=y&stockId=%s&lang=zh'
const ESTATE_DETAIL_ROWS = '#divEbook > table > tbody > tr > td > table > tbody > tr:nth-child(1) > td > table tr';
const PROP_DETAIL_DASHES = '#divStockInfo > table td, #divStockInfoMisc > table td';
const GOOG_MAP_IFRAME = '#mapframe';

function getSearchList(page = 1): Promise<any[]> {
    return new Promise((resolve, reject) => {
        superagent
        .post(SEARCH_LIST_RESULTS)
        .set('User-Agent', USER_AGENT)
        .set('Referer', 'http://www.hkp.com.hk/find-property/')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(buildSearchRequest(page)))
        .end((err, res) => {
            // console.log(res.body);
            // (res.body as Array<any>).forEach(s => {
            //     getPropertyDetail(s.serial_no);
            // });

            // getEstateDetail(res.body[0].serial_no);
            if (err) return reject(err);
            resolve(res.body as any[]);
        });
    });
}

function fetchDetailPage(serial): Promise<Window> {
    return new Promise((resolve, reject) => {
        let url = format(DETAIL_LAYER, serial);
        domEnv({
            url: url,
            done: (err, window) => {
                if (err) return reject(err);
                // console.log(window.document.body.innerHTML);
                resolve(window);
            }
        });
    });
}

function getEstateDetail(window: Window): { [key: string]: string } {
    let detail = {};
    Array.from(window.document.querySelectorAll(ESTATE_DETAIL_ROWS)).forEach(tr => {
        let entry = Array.from(tr.querySelectorAll('td'))
            .map(td => td.textContent);
        detail[entry[0].replace('：', '')] = entry[1];
    });
    return detail;
}

function getPropertyDetail(window: Window) {
    let detail = {};
    Array.from(window.document.querySelectorAll(PROP_DETAIL_DASHES))
        .map(td => {
            let entry = td.textContent.split(':');
            return entry;
        })
        .forEach(entry => {
            if (entry.length < 2) return;
            detail[heavyTrim(entry[0])] = entry[1] ? heavyTrim(entry[1]) : '????';
        });
    
    detail['月供'] = getNumberSeq(detail['月供'].split('元')[0]);
    return detail;
}

function getPropLocation(window: Window) {
    let spacers = window.document.querySelectorAll('img[src="http://resources.hkp.com.hk/images/common/spacer.gif"]');
    let lo = spacers[spacers.length - 1] as HTMLImageElement;
    // console.log(lo.onload, lo.getAttribute('onload'));
    return lo.getAttribute('onload').match(/q=([\.\d\,]+)&/)[1].split(',').map(parseFloat);
}

function buildSearchRequest(page = 1) {
    return {
        areaFrom: null,
        areaTo: null,
        area_type: "net_area",
        autocompleteString: "",
        bedroom: "",
        bldgIds: "",
        districtIds: "",
        estIds: "",
        estate_name: "",
        feature: "",
        is_hos: false,
        is_random: false,
        latLngBounds: "22.203172,113.877135,22.435656,114.333755",
        page: page,
        priceFrom: null,
        priceTo: null,
        sort: "",
        tx_type: "S",
        zoomLevel: 11
    }
}

// main

async function main() {
    const propFile = createWriteStream('./props1-500.csv');
    const estateFile = createWriteStream('./estates1-500.csv');
    const pool = new FiberPool(4);
    const START_PAGE = 1;
    const END_PAGE = 500;
    let sum = 0;

    // Write Unicode BOM (for Microsoft Excel)
    writeBOM(propFile, 'utf8');
    writeBOM(estateFile, 'utf8');

    for (let i = START_PAGE; i <= END_PAGE; ++i) {
        console.log('== Page: ' + i);
        let list = await getSearchList(1);

        for (let j = 0; j < list.length; ++j) {
            pool.push(() => doDetailPageFetch(list[j].serial_no, i, j));
        }

        if (i === END_PAGE) {
            // Wait till pool empty...
            console.log('Page fetching job end. Wait till pool empty...');
            await new Promise((resolve) => {
                pool.on('taskend', () => {
                    if (pool.queue.length === 0) {
                        pool.once('taskend', () => {
                            resolve();
                        });
                    }
                });
            });
        }
    }

    propFile.close();
    estateFile.close();
    pool.stop();

    async function doDetailPageFetch(serial: number, i: number, j: number) {
        let window = await fetchDetailPage(serial);
        let estate = getEstateDetail(window);
        let prop = getPropertyDetail(window);
        
        prop['estateName'] = estate['物業名稱']
        prop['location'] = getPropLocation(window);
        console.log(prop);

        let outProp = formatPropertyDetail(prop);
        let outEstate = formatEstate(estate);
        

        if (i === 1 && j === 0) {
            propFile.write(toCsvTitle(outProp) + '\r\n');
            estateFile.write(toCsvTitle(outEstate) + '\r\n');
        }
        // console.log(toCsvTuple(prop));
        propFile.write(toCsvTuple(outProp) + '\r\n');
        estateFile.write(toCsvTuple(outEstate) + '\r\n');
        // console.log(estate);
        // console.log(prop);
        console.log(`==== Finish fetch prop #${++sum}: ${serial}`)
        await sleep(0);
    }
        
}

main();