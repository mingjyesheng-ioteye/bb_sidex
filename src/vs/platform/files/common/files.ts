import { Event } from '../../../base/common/event';
import { IDisposable } from '../../../base/common/lifecycle';
import { createDecorator } from '../../instantiation/common/instantiation';

export const IFileService = createDecorator<IFileService>('fileService');

export enum FileChangeType {
  Updated = 0,
  Added = 1,
  Deleted = 2,
}

export interface IFileStat {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  mtime: number;
  children?: IFileStat[];
}

export interface IFileContent {
  path: string;
  value: string;
  encoding: string;
  mtime: number;
  size: number;
}

export interface IFileChange {
  path: string;
  type: FileChangeType;
}

export interface IFileWriteOptions {
  overwrite?: boolean;
  create?: boolean;
}

export interface IFileService {
  readonly serviceBrand: undefined;

  readonly onDidFilesChange: Event<IFileChange[]>;

  read(path: string): Promise<IFileContent>;
  write(path: string, content: string, options?: IFileWriteOptions): Promise<void>;
  stat(path: string): Promise<IFileStat>;
  readdir(path: string): Promise<IFileStat[]>;
  mkdir(path: string): Promise<void>;
  delete(path: string, recursive?: boolean): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  watch(path: string): IDisposable;
  search(rootPath: string, query: string): Promise<ISearchResult[]>;
}

export interface ISearchResult {
  path: string;
  matches: ISearchMatch[];
}

export interface ISearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}
