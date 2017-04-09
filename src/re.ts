import { getDomWindow } from './helper';
import { FiberPool } from './concurrency';
import { createWriteStream } from 'fs';

const HEADER = [ 'estate', '物業校網', '入伙日期', 'area' ];

async function getEstateList(): Promise<{ name: string, estId: string }[]> {
    let window = await getDomWindow({ url: 'http://app2.hkp.com.hk/residential_ebook/menu.jsp?lang=zh' });
    let names = Array.from(window.document.querySelectorAll('.tEstate td.estatetd'));

    return names.map(n => ({
        name: n.textContent,
        estId: n.getAttribute('onclick').match(/estId=(\w+)/)[1]
    }));
}

// getEstateList().then((list) => list.forEach((n) => console.log(n)));

async function getResidential(estId: string): Promise<string[]> {
    let window = await getDomWindow({ url: `http://app2.hkp.com.hk/residential_ebook/default.jsp?lang=zh&estId=${estId}` });
    let trs = Array.from(window.document.querySelectorAll('table tr[valign="TOP"]'));
    let row = trs.map(tr => {
        let title = tr.querySelector('td.title');
        let content = tr.querySelector('td.content');
        return [
            title? title.textContent.replace('：', '').trim() : '',
            content? content.textContent.trim() : ''
        ];
    });

    // console.log(row);

    return appendArea(row.filter(n => HEADER.indexOf(n[0]) > -1).map(n => n[1]));
}

function appendArea(row: string[]) {
    row.push(row[0].match(/中學：(.+)/)[1]);

    return row;
}

// getResidential('E000013865').then(re => console.log(re));

async function main() {
    let re = createWriteStream('re.csv');
    re.write(csvRow(HEADER));
    let list = await getEstateList();
    // let pool = new FiberPool(4);
    // pool.stopWhenProcessed(list.length);
    // let tasks = list.map((estate) => {
    //     return pool.push(() => {
    //         return getResidential(estate.estId).then((row) => {
    //             row.unshift(estate.name);
    //             console.log('Finish fetch: ', estate.name, estate.estId);
    //             // console.log(row.join(','));
    //             re.write(csvRow(row));
    //         });
    //     });
    // });

    // await Promise.all(tasks);

    for (let i = 0; i < list.length; ++i) {
        let estate = list[i];
        try {
            let row = await getResidential(estate.estId);
            row.unshift(estate.name);
            console.log('Finish fetch: ', estate.name, estate.estId);
            re.write(csvRow(row));
        }
        catch (e) {
            console.error(e);
        }
    }

    re.close();
}


main();

function csvRow(arr) {
    return arr.map(n => `"${n}"`).join(',') + '\n';
}
