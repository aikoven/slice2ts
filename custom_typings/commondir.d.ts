declare function commondir(absolutePaths: string[]): string;
declare function commondir(basedir: string, relativePaths: string[]): string;

declare namespace commondir {}

export = commondir;
