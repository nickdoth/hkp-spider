import { getNumberSeq } from './helper';

export function formatPropertyDetail(prop: any) {
    return {
        '樓盤': prop['樓盤'],
        '地區': prop['地區'],
        '實用面積': getNumberSeq(prop['實用面積']),
        '建築面積': getNumberSeq(prop['建築面積']),
        '售價': getNumberSeq(prop['售價']),
        '呎價': prop['呎價']? prop['呎價'].split('實').map(getNumberSeq).join('/') : '-',
        '呎租': prop['呎租']? prop['呎租'].split('實').map(getNumberSeq).join('/') : '-',
        '樓盤編號': prop['樓盤編號'],
        '特色': prop['特色'],
        '月供': prop['月供'],
        '更新日期': prop['更新日期'],
        'estateName': prop['estateName'],
        'lat': prop['location'][0],
        'lng': prop['location'][1]
    };
}

export function formatEstate(estate: any) {
    return {
        '物業名稱': estate['物業名稱'],
        '地區': estate['地區'],
        '區域': estate['區域'],
        '地址/地段': estate['地址/地段'],
        '物業座數': estate['物業座數'],
        '物業層數': estate['物業層數'],
        '住宅類別': estate['住宅類別'],
        '物業校網': estate['物業校網'],
        '入伙日期': estate['入伙日期'],
        '管理公司': estate['管理公司'],
        '物業優點': estate['物業優點']
    };
}