import {
  File,
  Folder,
  stringifyFimidaraFilenamepath,
  stringifyFimidaraFoldernamepath,
} from 'fimidara';
import {createWriteStream, ensureFile} from 'fs-extra';
import path from 'path';
import {Readable, Writable} from 'stream';
import {getFimidara} from '../utils/fimidara.js';
import {getFimidaraFilepath, getLocalFilepath} from '../utils/path.js';
import {IFilesOpts, IRunnerOpts, kFileEntryType} from './types.js';

async function getFile(from: string, opts: IRunnerOpts) {
  try {
    const {body} = await getFimidara(opts).files.getFileDetails({
      body: {filepath: getFimidaraFilepath(from, opts)},
    });
    return body.file;
  } catch (error: unknown) {
    return undefined;
  }
}

async function getFolder(from: string, opts: IRunnerOpts) {
  try {
    const {body} = await getFimidara(opts).folders.getFolder({
      body: {folderpath: getFimidaraFilepath(from, opts)},
    });
    return body.folder;
  } catch (error: unknown) {
    return undefined;
  }
}

async function checkType(
  from: string,
  opts: IRunnerOpts
): Promise<
  | {type: typeof kFileEntryType.file; file: File}
  | {type: typeof kFileEntryType.folder; folder: Folder}
  | undefined
> {
  const [file, folder] = await Promise.all([
    getFile(from, opts),
    getFolder(from, opts),
  ]);

  if (file) {
    return {file, type: kFileEntryType.file};
  } else if (folder) {
    return {folder, type: kFileEntryType.folder};
  }

  return undefined;
}

function copyToStream(rstream: Readable, wstream: Writable) {
  return new Promise<void>((resolve, reject) => {
    wstream.addListener('close', resolve);
    rstream.addListener('error', reject);
    wstream.addListener('error', reject);
    rstream.pipe(wstream);
  });
}

async function copyFile(from: string, to: string, opts: IRunnerOpts) {
  const localFilepath = getLocalFilepath(to, opts);
  const [{body}] = await Promise.all([
    getFimidara(opts).files.readFile({
      body: {filepath: getFimidaraFilepath(from, opts)},
      responseType: 'stream',
    }),
    ensureFile(localFilepath),
  ]);

  const wstream = createWriteStream(localFilepath, {autoClose: true});
  await copyToStream(body as Readable, wstream);
}

async function copyFolderFiles(
  from: string,
  to: string,
  opts: IRunnerOpts,
  pageSize = 20
) {
  for (let page = 0, files: File[] = []; files.length; page++) {
    const fResult = await getFimidara(opts).folders.listFolderContent({
      body: {pageSize, folderpath: from, page: page, contentType: 'file'},
    });
    files = fResult.body.files;

    await Promise.all(
      files.map(file =>
        copyFile(
          stringifyFimidaraFilenamepath(file),
          path.join(to, file.name + (file.ext ? `.${file.ext}` : '')),
          opts
        )
      )
    );
  }
}

async function copyFolderFolders(from: string, to: string, opts: IRunnerOpts) {
  // maximum of 100 files copied at a time, which may still be too much
  const folderPageSize = 10;
  const filePageSize = 10;

  for (let page = 0, folders: Folder[] = []; folders.length; page++) {
    const fResult = await getFimidara(opts).folders.listFolderContent({
      body: {
        pageSize: folderPageSize,
        folderpath: from,
        page: page,
        contentType: 'folder',
      },
    });
    folders = fResult.body.folders;

    await Promise.all(
      folders.map(folder =>
        copyFolder(
          stringifyFimidaraFoldernamepath(folder),
          path.join(to, folder.name),
          opts,
          filePageSize
        )
      )
    );
  }
}

async function copyFolder(
  from: string,
  to: string,
  opts: IRunnerOpts,
  filePageSize: number
) {
  await copyFolderFiles(from, to, opts, filePageSize);
  await copyFolderFolders(from, to, opts);
}

export async function copyFileOrFolder(f: IFilesOpts, opts: IRunnerOpts) {
  const {from, to} = f;
  let type = f.type;

  if (!type) {
    const cResult = await checkType(from, opts);
    type = cResult?.type;
  }

  if (type === kFileEntryType.file) {
    await copyFile(from, to, opts);
  } else if (type === kFileEntryType.folder) {
    const filePageSize = 20;
    await copyFolder(from, to, opts, filePageSize);
  }
}
