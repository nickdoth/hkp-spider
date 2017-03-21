import { post } from 'superagent';
import { env as domEnv } from 'jsdom';
import { decode, encode } from 'iconv-lite';
import { createWriteStream } from 'fs';

import { toCsvTitle, toCsvTuple, getNumberSeq, getTextNodeSeq,
    sleep, FetchError, writeBOM, atoc, USER_AGENT } from './helper';
import { FiberPool } from './concurrency';

const RETRY_COUNT = 5;
const TABLE_HEADER = ['成交日期', '座', '樓', '室', '交易类型', '成交價', '面積(呎)(實)', '面積(呎)(建)',
    '呎價(實)', '呎價(建)',
    '上一次成交日期', '上一次成交價', '升/跌幅'];

function getAllEstates(): Promise<{ name: string, id: string }[]> {
    return new Promise((resolve, reject) => {
        domEnv({
            url: 'http://app2.hkp.com.hk/tx/default.jsp?lang=zh',
            done: (err, window) => {
                if (err) reject(err);
                let estates = Array.from(window.document.querySelector('#estList > tbody').querySelectorAll('tr'))
                .filter(tr => /tr_est/.test(tr.id))
                .map(tr => {
                    let td0 = tr.querySelectorAll('td')[0];
                    return {
                        name: getTextNodeSeq(td0).trim(),
                        id: tr.querySelector('a').href.match(/estateId=(\w+)/)[1]
                    }
                });

                resolve(estates);
            }
        });
    });
}


function getTxPageOfEstate(eid: string, page: number, retry = 0): Promise<string[][]> {
    return new Promise((resolve, reject) => {
        post('http://app2.hkp.com.hk/tx/index.jsp')
        .set('User-Agent', USER_AGENT)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('Referer', 'http://app2.hkp.com.hk/tx/index.jsp')
        .responseType('buffer') // Let superagent return response.body as buffer
        .send(buildTxRequest(eid, page))
        .end((err, res) => {
            if (err) {
                // Retry logic
                if (retry < RETRY_COUNT) {
                    console.error(
                        `Warning: Request error when fetching { eid: ${eid}, page: ${page} }, retry after 10s...`);
                    resolve(sleep(10000).then(() => {
                        return getTxPageOfEstate(eid, page, ++retry);
                    }));
                }
                else {
                    reject(new FetchError(
                        `Unexpected network rejection after ${RETRY_COUNT} attempts: (eid: ${eid}, page: ${page})`,
                        { eid, page },
                        err)
                    );
                }
            }
            else {
                // In `./cs.ts` file, same process does not need to handle the charset issue,
                // this may cause by auto charset converting within jsdom.
                resolve(parseEstateList(decode(res.body as Buffer, 'big5-hkscs')));
            }
        });
    });
}

// test(() => getTxPageOfEstate('E00123', 1).then(list => console.log(list)));

function parseEstateList(html: string): Promise<string[][]> {
    return new Promise((resolve, reject) => {
        domEnv({
            html: html,
            done: (err, window) => {
                if (err) reject(err);
                let list = Array.from(
                    window.document.querySelectorAll('#mdbrec > table:nth-child(2) > tbody > tr.row_hover_bg')
                )
                .map(tr => Array.from(tr.querySelectorAll('td')).map(td => getTextNodeSeq(td).trim()))
                .map(vals => [ atoc(vals[1]), vals[6], vals[7], vals[8], vals[9],
                    getNumberSeq(vals[10]), vals[11], vals[12], getNumberSeq(vals[13]), getNumberSeq(vals[14]),
                    /* (Optional) */ atoc(vals[15] || ''), getNumberSeq(vals[16] || ''), vals[17] || '']);
                // console.log(list);
                resolve(list);

            }
        });
    });
}

function buildTxRequest(eid: string, page: number, showYear: number = 3) {
    return {
        estateId: eid,
        bldgId: '',
        phase: '',
        bldgName: '',
        block: '',
        floor: '',
        unit: '',
        sortBy: 'lastTransDate',
        orderBy: 'desc',
        estSortBy: 'NUMOFTX',
        estOrderBy: 'desc',
        mrSortBy:'DELI_DATE',
        mrOrderBy:'desc',
        lang:'zh',
        hidLink:'',
        hidAll:'',
        pageSize: 30,
        page: page,
        mrPageSize: 10,
        mrPage: 1,
        tempDistId: '',
        tempDistId2: '',
        tempDistId3: '',
        distIdHK: '',
        distIdKN: '',
        distIdNT: '',
        cb_rent: 'Y',
        cb_price: 'Y',
        minSell: '',
        maxSell: '',
        minRent: '',
        maxRent: '',
        price: '',
        priceText: '',
        priceSliderPos: '',
        priceTemp: '',
        p_R: '',
        pT_R: '',
        pSP_R: '',
        cP_R: '',
        rent: '',
        rentText: '',
        rentSliderPos: '',
        rentTemp: '',
        r_R: '',
        rT_R: '',
        rSP_R: '',
        cR_R: '',
        a_R: '',
        aT_R: '',
        aSP_R: '0,400',
        cA_R: '',
        area: '',
        areaText: '',
        areaSliderPos: '',
        areaTemp: '',
        showYear: 3,
        pick_dist_hk: '',
        pick_dist_kn: '',
        pick_dist_nt: '',
        pick_area: '',
        estate: '',
        cb_price_ck: 'Y',
        cb_rent_ck: 'Y',
        cb_price_1: 'total',
        cb_rent_1: 'total',
        price_temp: '100000-',
        price_temp_from: 10,
        price_temp_to: '2,000',
        price_slider_pos_temp: '',
        rent_temp: '2000-',
        rent_temp_from: '2,000',
        rent_temp_to: '200,000',
        rent_slider_pos_temp: ''
    }
}

async function main() {
    let logfile = createWriteStream(`./tx_log_${new Date()}.log`);
    let logger = (str) => {
        logfile.write(str);
        process.stdout.write(str);
    };
    logger('== Fetching estate list...\n');
    let estates = await getAllEstates();
    logger(`== Done. (${estates.length} estates in total)\n`);

    let reqCount = 0;
    let startTime = Date.now();
    let txFileAll = createWriteStream(`./TX_ALL.csv`);
    // Write Unicode BOM (for Microsoft Excel)
    writeBOM(txFileAll, 'utf16le');
    // Write table header
    writeTsv(txFileAll, '"ESTATE"\t' + fromArraytoTsvTuple(TABLE_HEADER) + '\n');

    // await mutliIterate(estates, 1, async (es) => {
    //     await Promise.all(es.map(main_estate));
    // });

    let pool = new FiberPool(4);

    for (let i = 0; i < estates.length; ++i) {
        pool.push(() => {
            return main_estate(estates[i]);
        });
    }

    // Wait till all estate fetching completed...
    await new Promise(resolve => {
        pool.on('taskend', () => {
            console.log('General Process:', `${Math.ceil(pool.taskendCount / estates.length * 100)}%`);
            if (pool.taskendCount === estates.length) {
                pool.stop();
                resolve();
            }
        })
    });
    

    txFileAll.close();
    logfile.close();
    console.log('END');
    async function main_estate(estate: { name: string, id: string }) {
        logger(`\n== Processing estate #${estate.id}: ${estate.name}\n`);
        // let txFile = createWriteStream(`./tx/TX_${estate.id}_${estate.name}.csv`);
        let txFile = txFileAll;
        let page = 0;
        // writeCsv(txFile, fromArraytoCsvTuple(TABLE_HEADER) + '\n');
        let next: string[][] = undefined;
        let pageCount = 0;
        do {
            ++page;
            logger(`==== Fetching page...\n`);
            try {
                next = await getTxPageOfEstate(estate.id, page);
            } catch (e) {
                if (e instanceof FetchError) {
                    logger(e.toString() + '\n');
                    logger('Warning: This estate page need retrying later.\n');
                }
            }
            ++reqCount;
            if (next.length !== 0) {
                writeTsv(txFile, next.map(n => {
                    return `"${estate.name}"\t` + fromArraytoTsvTuple(n);
                }).join('\n') + '\n');
            }
            let lastTime = Date.now() - startTime;
            logger(`==== Written page: ${page} (cur: ${lastTime}ms; avg: ${Math.floor(lastTime / reqCount)}ms) \n`);
        } while (next.length !== 0);
        // txFile.close();
    }


}

main().catch((err) => {
    console.error('TxMain: Unexpected rejection:', err);
});

// TODO: These may be better living in helper.ts

function fromArraytoTsvTuple(arr: string[]): string {
    return arr.map(n => `"${n}"`).join('\t');
}

function writeTsv(file, str) {
    file.write(encode(str, 'utf16le'));
}

// test(() => console.log(atoc('22/12/2016'), atoc('22/12/2016') === '2016/12/22'));

