// 线程池 & 本地缓存持久化
import fs from 'fs';
import path from 'path';
import { IThread } from "../types";

const CACHE_FILE = path.join(process.cwd(), "cache-db.json");

class ThreadPool {
    private pool = new Map<string, IThread>();

    constructor() {
        this.init();
    }

    private init() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, 'utf-8');
                const parsed = JSON.parse(data);
                for (const [key, value] of Object.entries(parsed)) {
                    this.pool.set(key, value as IThread);
                }
                console.log(`✅ 成功从本地恢复了 ${this.pool.size} 个历史会话线程！`);
            }
        } catch (err) {
            console.error('加载历史会话缓存失败:', err);
        }
    }

    save() {
        try {
            const obj = Object.fromEntries(this.pool);
            fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
        } catch (err) {
            console.error('保存历史会话缓存出错:', err);
        }
    }

    has(key: string) {
        return this.pool.has(key);
    }

    get(key: string) {
        return this.pool.get(key);
    }

    add(key: string, value: IThread) {
        this.pool.set(key, value);
        this.save();
    }

    delete(key: string) {
        this.pool.delete(key);
        this.save();
    }

    list() {
        return Array.from(this.pool.values());
    }

    clear() {
        this.pool.clear();
        this.save();
    }
}

export const threadPool = new ThreadPool();
