import dotenv from "dotenv";
import { rootDir } from './rootpath';
import path from 'path';

let envLoaded = false;

export function loadServerEnv() {
    if (envLoaded) {
        return;
    }

    dotenv.config({
        path: path.resolve(rootDir, '.env'),
    });
    envLoaded = true;
}
