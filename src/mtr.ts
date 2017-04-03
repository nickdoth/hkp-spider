import { env as domEnv } from 'jsdom';
import { FiberPool } from './concurrency';
import { createWriteStream } from 'fs';
import { writeBOM } from './helper';

const STATION_LIST = 'https://en.wikipedia.org/wiki/Category:MTR_stations';
const HEADER = ['Station', 'Lat', 'Lug'];

function fetchStationList(): Promise<{ name: string, href: string }[]> {
    return new Promise((resolve, reject) => {
        domEnv({
            url: STATION_LIST,
            done: function (err, window) {
                if (err) return reject(err);
                let links = Array.from(window.document.querySelectorAll('#mw-pages > div > div li a')) as HTMLAnchorElement[];
                links.shift(); // Delete the first one ("List of MTR stations")
                resolve(links.map(l => ({ name: l.textContent, href: l.href })));
            }
        });
    });
}

// fetchStationList().then(list => {
//     console.log(list);
// })

function fetchCoordinate(station: { name: string, href: string }): Promise<[string, string] | null> {
    return new Promise((resolve, reject) => {
        domEnv({
            url: station.href,
            done: function (err, window) {
                if (err) return reject(err);
                let vcard = Array.from(window.document.querySelectorAll('#mw-content-text > table.infobox.vcard > tbody > tr'));
                let coordDash = vcard.filter(tr => {
                    let th = tr.querySelector('th');
                    return th && th.textContent.trim() === 'Coordinates';
                })[0];
                if (coordDash) {
                    resolve(formatCoord(coordDash.querySelector('td .geo-dec').textContent));
                }
                else {
                    resolve(null);
                }
            }
        });
    });
}

function formatCoord(coord: string) {
    return coord.replace(/°|N|E/g, '').split(' ');
}

// fetchCoordinate({ name: 'xxx', href: 'https://en.wikipedia.org/wiki/Aberdeen_Station_(MTR)' }).then(coord => {
//     console.log(coord);
// })

async function main() {
    let list = await fetchStationList();
    let pool = new FiberPool(4);
    pool.stopWhenProcessed(list.length);

    let outFile = createWriteStream('./mtr-coord.csv');
    writeBOM(outFile, 'utf8');
    outFile.write(HEADER.join(',') + '\r\n');
    
    let tasks = list.map(station => {
        return pool.push(() => {
            return fetchCoordinate(station).then(coord => {
                console.log(station.name, coord);
                if (!coord) return;
                outFile.write([ station.name, ...coord ].join(',') + '\r\n');
            });
        });
    });

    await Promise.all(tasks);

    outFile.close();
}

main();