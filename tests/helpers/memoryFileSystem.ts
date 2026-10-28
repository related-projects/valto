/**
 * An in-memory stand-in for the expo-file-system File API (REGISTRE V-94, V-95).
 *
 * It carries only what the export and the backup paths call: a File built from a
 * uri, or from a directory plus a name, with `exists`, `name`, `size`, `write`,
 * `text`, `delete` and `move`; and a Directory with `exists`, `name`, `list` and
 * `delete`. `move` refuses a missing source and an existing destination, as the
 * native module does (android FileSystemPath.kt move -> Path.moveTo without
 * overwrite; ios FileSystemPath.swift move -> FileManager.moveItem), so a test
 * cannot pass on a replace that a device would refuse.
 *
 * A directory exists while a file exists under it, and `list` returns its direct
 * children: a File for each file, a Directory for each subdirectory.
 *
 * A jest.mock factory reaches it through jest.requireActual, which returns the
 * same instance the test imports, so both see one `memoryFiles`:
 *
 *     jest.mock('expo-file-system', () =>
 *         jest.requireActual('<relative path>/tests/helpers/memoryFileSystem').memoryFileSystemModule());
 */

/** Every file that exists, by uri. A test clears it before each case. */
export const memoryFiles = new Set<string>();

/** What `write` stored, by uri. A file added to memoryFiles directly reads as empty. */
export const memoryContents = new Map<string, string>();

type UriPart = string | { uri: string };

function joinUri(parts: UriPart[]): string {
    return parts
        .map(part => (typeof part === 'string' ? part : part.uri))
        .reduce((joined, part) => `${joined.replace(/\/+$/, '')}/${part.replace(/^\/+/, '')}`);
}

const lastSegment = (uri: string): string => uri.replace(/\/+$/, '').split('/').pop() ?? '';

export class MemoryFile {
    uri: string;

    constructor(...parts: UriPart[]) {
        this.uri = joinUri(parts);
    }

    get exists(): boolean {
        return memoryFiles.has(this.uri);
    }

    get name(): string {
        return lastSegment(this.uri);
    }

    get size(): number {
        return this.exists ? (memoryContents.get(this.uri) ?? '').length : 0;
    }

    write(content = ''): void {
        memoryFiles.add(this.uri);
        memoryContents.set(this.uri, content);
    }

    async text(): Promise<string> {
        if (!this.exists) {
            throw new Error(`text: ${this.uri} does not exist`);
        }
        return memoryContents.get(this.uri) ?? '';
    }

    delete(): void {
        if (!memoryFiles.delete(this.uri)) {
            throw new Error(`delete: ${this.uri} does not exist`);
        }
        memoryContents.delete(this.uri);
    }

    move(destination: MemoryFile): void {
        if (!memoryFiles.has(this.uri)) {
            throw new Error(`move: ${this.uri} does not exist`);
        }
        if (memoryFiles.has(destination.uri)) {
            throw new Error(`move: ${destination.uri} already exists`);
        }
        const content = memoryContents.get(this.uri);
        memoryFiles.delete(this.uri);
        memoryContents.delete(this.uri);
        memoryFiles.add(destination.uri);
        if (content !== undefined) {
            memoryContents.set(destination.uri, content);
        }
        this.uri = destination.uri;
    }
}

export class MemoryDirectory {
    uri: string;

    constructor(...parts: UriPart[]) {
        this.uri = joinUri(parts).replace(/\/+$/, '');
    }

    private get prefix(): string {
        return `${this.uri}/`;
    }

    get exists(): boolean {
        return [...memoryFiles].some(uri => uri.startsWith(this.prefix));
    }

    get name(): string {
        return lastSegment(this.uri);
    }

    list(): (MemoryFile | MemoryDirectory)[] {
        if (!this.exists) {
            throw new Error(`list: ${this.uri} does not exist`);
        }
        const files: MemoryFile[] = [];
        const directories = new Set<string>();
        for (const uri of memoryFiles) {
            if (!uri.startsWith(this.prefix)) continue;
            const rest = uri.slice(this.prefix.length);
            const slash = rest.indexOf('/');
            if (slash === -1) {
                files.push(new MemoryFile(uri));
            } else {
                directories.add(rest.slice(0, slash));
            }
        }
        return [...[...directories].map(name => new MemoryDirectory(this.prefix + name)), ...files];
    }

    /** Removes the directory and everything under it. */
    delete(): void {
        if (!this.exists) {
            throw new Error(`delete: ${this.uri} does not exist`);
        }
        for (const uri of [...memoryFiles]) {
            if (uri.startsWith(this.prefix)) {
                memoryFiles.delete(uri);
                memoryContents.delete(uri);
            }
        }
    }
}

/** The directory the export and the backup write into. */
export const memoryPaths = { cache: { uri: 'file:///cache/' } };

/** What jest.mock('expo-file-system', ...) returns. */
export function memoryFileSystemModule() {
    return { File: MemoryFile, Directory: MemoryDirectory, Paths: memoryPaths };
}
