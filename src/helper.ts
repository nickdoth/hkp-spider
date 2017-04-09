import { env as domEnv, Config as JsDomConfig } from 'jsdom';

export function getDomWindow(options: JsDomConfig): Promise<Window> {
    return new Promise((resolve, reject) => {
        domEnv({
            ...options,
            done: (err, window) => {
                if (err) return reject(err);
                resolve(window);
            }
        });
    });
}

export function heavyTrim(str: string) {
    return str.trim().replace(/[\s\n\t]+/g, '');
    // return str.trim();
}

export function getNumberSeq(str: string | null): string {
    if (!str) return '';
    return Array.from(str).filter(n => n.charCodeAt(0) >= 48 && n.charCodeAt(0) <= 57).join('');
}

export function sleep(timeout: number) {
    return new Promise((resolve) => setTimeout(resolve, timeout));
}

export function toCsvTitle(obj: object) {
    return Object.keys(obj).map(n => `"${n}"`).join(',');
}

export function toCsvTuple(obj: object) {
    return Object.keys(obj).map(k => obj[k]).map(n => `"${n ? n : '-'}"`).join(',');
}

export function getTextNodeSeq(node: Node) {
    let str = '';
    
    if (node.hasChildNodes()) {
        for (let i = 0; i < node.childNodes.length; ++i) {
            str += getTextNodeSeq(node.childNodes[i]);
        }
        return str
    }
    else if (node.nodeType === 3) {
        return node.textContent;
    }
    else {
        return '';
    }
}

export function atoc(date: string): string {
    return date.split('/').reverse().join('/');
}

export function writeBOM(file, charset) {
    switch (charset) {
    case 'utf8':
        file.write(Buffer.from([ 0xef, 0xbb, 0xbf ]));
    break;
    case 'utf16le':
        file.write(Buffer.from([ 0xff, 0xfe ]));
    break;
    }
}

export class FetchError implements Error {
    message: string;
    name: 'FetchError';
    prevError?: Error;
    reqArgs?: any;

    constructor(message: string, reqArgs?: any, prevError?: Error) {
        this.message = message;
        this.prevError = prevError;
        this.reqArgs = reqArgs;
    }

    toString() {
        return `${this.message} (previous: ${this.prevError.toString()})`;
    }
}

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'; 