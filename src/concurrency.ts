import { EventEmitter } from 'events';

export class FiberPool extends EventEmitter {
    queue: ({ resolve: Function, reject: Function, task: () => Promise<any> })[] = [];
    private running = 0;
    private stoped: boolean = false;
    taskendCount = 0;

    constructor(private fiberSize: number) {
        super();
        this.start();
    }

    private next() {
        if (this.running < this.fiberSize) {
            let deferer = this.queue.shift();
            if (!deferer) return;
            ++this.running;
            deferer.task().then((val) => {
                ++this.taskendCount;
                --this.running;
                this.emit('taskend');
                this.emit('taskok');
                deferer.resolve(val);
            }, (err) => {
                ++this.taskendCount;
                --this.running;
                this.emit('taskend');
                this.emit('taskfailed');
                deferer.reject(err);
            });
        }
    }

    push<T>(task: () => Promise<T>): Promise<T> {
        let deferer = new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject, task });
        });
        
        return deferer;
    }

    start() {
        setTimeout(() => {
            this.next();
            if (!this.stoped) {
                this.start();
            }
        }, 0);
    }

    stop() {
        this.stoped = true;
    }
}

export async function mutliIterate<T>(arr: T[], parts: number, func: (s: T[]) => Promise<void>) {
    for (let i = 0; i < arr.length / parts; ++i) {
        let s: number[] = [];
        for (let j = 0; j < parts; ++j) {
            s.push(i + arr.length / parts * j); 
        }
        await func(s.map(n => arr[n]));
    }
}