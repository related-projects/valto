/**
 * An in-memory stand-in for the expo-file-system File API (REGISTRE V-94, V-95).
 *
 * It carries only what the export and the backup paths call: a File built from a
 * uri, or from a directory plus a name, with `exists`, `write`, `delete` and
 * `move`. `move` refuses a missing source and an existing destination, as the
 * native module does (android FileSystemPath.kt move -> Path.moveTo without
 * overwrite; ios FileSystemPath.swift move -> FileManager.moveItem), so a test
 * cannot pass on a replace that a device would refuse.
 *
 * A jest.mock factory reaches it through jest.requireActual, which returns the
 * same instance the test imports, so both see one `memoryFiles`:
 *
 *     jest.mock('expo-file-system', () =>
 *         jest.requireActual('<relative path>/tests/helpers/memoryFileSystem').memoryFileSystemModule());
 */

/** Every file that exists, by uri. A test clears it before each case. */
export const memoryFiles = new Set<string>();

type UriPart = string | { uri: string };

function joinUri(parts: UriPart[]): string {
    return parts
        .map(part => (typeof part === 'string' ? part : part.uri))
        .reduce((joined, part) => `${joined.replace(/\/+$/, '')}/${part.replace(/^\/+/, '')}`);
}

export class MemoryFile {
    uri: string;

    constructor(...parts: UriPart[]) {
        this.uri = joinUri(parts);
    }

    get exists(): boolean {
        return memoryFiles.has(this.uri);
    }

    write(): void {
        memoryFiles.add(this.uri);
    }

    delete(): void {
        if (!memoryFiles.delete(this.uri)) {
            throw new Error(`delete: ${this.uri} does not exist`);
        }
    }

    move(destination: MemoryFile): void {
        if (!memoryFiles.has(this.uri)) {
            throw new Error(`move: ${this.uri} does not exist`);
        }
        if (memoryFiles.has(destination.uri)) {
            throw new Error(`move: ${destination.uri} already exists`);
        }
        memoryFiles.delete(this.uri);
        memoryFiles.add(destination.uri);
        this.uri = destination.uri;
    }
}

/** The directory the export and the backup write into. */
export const memoryPaths = { cache: { uri: 'file:///cache/' } };

/** What jest.mock('expo-file-system', ...) returns. */
export function memoryFileSystemModule() {
    return { File: MemoryFile, Paths: memoryPaths };
}
