
import * as assert from 'assert';
import { RemoteLanguageClient } from 'javascript-typescript-langserver/lib/lang-handler';
import { describeTypeScriptService, initializeTypeScriptService, shutdownTypeScriptService, TestContext as TypeScriptServiceTestContext } from 'javascript-typescript-langserver/lib/test/typescript-service-helpers';
import { TypeScriptServiceFactory, TypeScriptServiceOptions } from 'javascript-typescript-langserver/lib/typescript-service';
import { IContextDefinition, ITestDefinition } from 'mocha';
import { BuildHandler } from '../buildhandler';
import rimraf = require('rimraf');
// global.Promise = require('bluebird');
import * as util from 'javascript-typescript-langserver/lib/util';
import { apply } from 'json-patch';
import * as fs from 'mz/fs';
import * as os from 'os';
import * as path from 'path';
// forcing strict mode
util.setStrict(true);

interface TestContext extends TypeScriptServiceTestContext {
	service: BuildHandler;
}

const tempDir = path.join(os.tmpdir(), 'tsjs', 'test');
const createHandler: TypeScriptServiceFactory = (client: RemoteLanguageClient, options: TypeScriptServiceOptions) => new BuildHandler(client, { ...options, tempDir });

/**
 * Shuts the TypeScriptService down (to be used in `afterEach()`) and deletes its temporary directory
 */
export async function shutdownBuildHandler(this: TestContext): Promise<void> {
	await shutdownTypeScriptService.call(this);
	await new Promise((resolve, reject) => rimraf(tempDir, err => err ? reject(err) : resolve()));
}

// Run build-handler-specific tests
describe('BuildHandler', function (this: TestContext & IContextDefinition) {
	this.timeout(30000);

	beforeEach(done => rimraf(tempDir, done));

	describeTypeScriptService(createHandler, shutdownBuildHandler, 'file:///');

	describe('Workspace with single package.json at root', function (this: TestContext) {
		beforeEach(initializeTypeScriptService(createHandler, 'file:///', new Map([
			['file:///package.json', JSON.stringify({
				name: 'mypkg',
				version: '4.0.2',
				scripts: {
					preinstall: 'echo preinstall should not run && exit 1',
					postinstall: 'echo postinstall should not run && exit 1',
					install: 'echo install should not run && exit 1'
				},
				dependencies: {
					typescript: '2.1.1',
					diff: '3.0.1'
				},
				devDependencies: {
					'@types/diff': '0.0.31'
				}
			})],
			['file:///a.ts', [
				"import * as diff from 'diff';",
				"import { diffChars, IDiffResult } from 'diff'",
				'',
				"diffChars('foo', 'bar')"
			].join('\n')],
			['file:///b.ts', [
				"import * as ts from 'typescript';",
				'',
				'var s: ts.SyntaxKind;',
				'var t = s;',
				''
			].join('\n')]
		])) as any);
		afterEach(shutdownBuildHandler as any);
		describe('shutdown()', () => {
			it('should delete the temporary directory passed in options', async function (this: TestContext) {
				// Do a random request just to trigger dependency installation
				await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 12
					}
				}).toPromise();
				assert(await fs.exists(tempDir), `Expected ${tempDir} to be created`);
				await this.service.shutdown().toPromise();
				assert(!await fs.exists(tempDir), `Expected ${tempDir} to be deleted`);
			});
		});
		describe('textDocumentDefinition()', function (this: TestContext) {
			it('should return the location of the `JsDiff` namespace declaration in DefinitelyTyped on the module alias', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 12
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 8,
							character: 18
						},
						end: {
							line: 8,
							character: 24
						}
					}
				}]);
			} as any);
			it('should return the location of the `diff` module export in DefinitelyTyped on the module name', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 23
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 5,
							character: 0
						},
						end: {
							line: 87,
							character: 0
						}
					}
				}]);
			} as any);
			it('should return the location of the `diffChars` function declaration on a named import', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 1,
						character: 10
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 55,
							character: 13
						},
						end: {
							line: 55,
							character: 22
						}
					}
				}, {
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 55,
							character: 13
						},
						end: {
							line: 55,
							character: 22
						}
					}
				}]);
			} as any);
			it('should return the location of the `IDiffResult` interface on a named import', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 1,
						character: 21
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 9,
							character: 14
						},
						end: {
							line: 9,
							character: 25
						}
					}
				}]);
			} as any);
			it('should return the location of the `diff` module export in DefinitelyTyped on the module name of a named import', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 1,
						character: 40
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 5,
							character: 0
						},
						end: {
							line: 87,
							character: 0
						}
					}
				}]);
			} as any);
			it('should return the location of the `diffChars` function definition in DefinitelyTyped on a function call', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 3,
						character: 0
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 55,
							character: 13
						},
						end: {
							line: 55,
							character: 22
						}
					}
				}]);
			} as any);
		} as any);
		describe('textDocumentXdefinition()', function (this: TestContext) {
			it('should return the SymbolDescriptor of the `JsDiff` namespace declaration in DefinitelyTyped on the module alias', async function (this: TestContext) {
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 12
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: '@types/diff/index.d.ts',
						containerKind: '',
						containerName: '',
						kind: 'module',
						name: 'JsDiff',
						package: {
							name: '@types/diff',
							version: '0.0.31',
							repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
						}
					}
				}]);
			} as any);
			it('should return the SymbolDescriptor of the `diff` module export in DefinitelyTyped on the module name', async function (this: TestContext) {
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 23
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: '@types/diff/index.d.ts',
						containerKind: '',
						containerName: '',
						kind: 'module',
						name: '"@types/diff/index"',
						package: {
							name: '@types/diff',
							version: '0.0.31',
							repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
						}
					}
				}]);
			} as any);
			it('should return the SymbolDescriptor of the `diffChars` function declaration on a named import', async function (this: TestContext) {
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 1,
						character: 10
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: '@types/diff/index.d.ts',
						containerKind: '',
						containerName: 'diff',
						kind: 'function',
						name: 'diffChars',
						package: {
							name: '@types/diff',
							version: '0.0.31',
							repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
						}
					}
				}]);
			} as any);
			it('should return the SymbolDescriptor of the `IDiffResult` interface on a named import', async function (this: TestContext) {
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 1,
						character: 21
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: '@types/diff/index.d.ts',
						containerKind: '',
						containerName: 'diff',
						kind: 'interface',
						name: 'IDiffResult',
						package: {
							name: '@types/diff',
							version: '0.0.31',
							repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
						}
					}
				}]);
			} as any);
			it('should return the SymbolDescriptor of the `diff` module export in DefinitelyTyped on the module name of a named import', async function (this: TestContext) {
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 1,
						character: 40
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: '@types/diff/index.d.ts',
						containerKind: '',
						containerName: '',
						kind: 'module',
						name: '"@types/diff/index"',
						package: {
							name: '@types/diff',
							version: '0.0.31',
							repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
						}
					}
				}]);
			} as any);
			it('should return the SymbolDescriptor of the `diffChars` function definition in DefinitelyTyped on function call', async function (this: TestContext) {
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 3,
						character: 0
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: '@types/diff/index.d.ts',
						containerKind: '',
						containerName: 'JsDiff',
						kind: 'function',
						name: 'diffChars',
						package: {
							name: '@types/diff',
							version: '0.0.31',
							repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
						}
					}
				}]);
			} as any);
			it('should return the SymbolDescriptor with PackageDescriptor of typescript package on `ts.SyntaxKind`', async function (this: TestContext & ITestDefinition) {
				this.timeout(60000);
				const result = await this.service.textDocumentXdefinition({
					textDocument: {
						uri: 'file:///b.ts'
					},
					position: {
						line: 2,
						character: 10
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					location: undefined,
					symbol: {
						filePath: 'typescript/lib/typescript.d.ts',
						containerKind: '',
						containerName: 'ts',
						kind: 'enum',
						name: 'SyntaxKind',
						package: {
							name: 'typescript',
							version: '2.1.1',
							repoURL: 'https://github.com/Microsoft/TypeScript.git'
						}
					}
				}]);
			} as any);
		} as any);
		describe('workspaceXreferences()', async function (this: TestContext) {
			it('should return all references to the diffChars function', async function (this: TestContext) {
				const referencesResult = await this.service.workspaceXreferences({
					query: {
						containerKind: '',
						containerName: 'diff',
						kind: 'function',
						name: 'diffChars',
						package: {
							name: '@types/diff',
							version: '0.0.31'
						}
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(referencesResult, [
					{
						reference: {
							range: {
								end: {
									character: 18,
									line: 1
								},
								start: {
									character: 9,
									line: 1
								}
							},
							uri: 'file:///a.ts'
						},
						symbol: {
							filePath: 'node_modules/@types/diff/index.d.ts',
							containerKind: '',
							containerName: 'diff',
							kind: 'function',
							name: 'diffChars',
							package: {
								name: '@types/diff',
								version: '0.0.31',
								repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
							}
						}
					},
					{
						reference: {
							range: {
								end: {
									character: 18,
									line: 1
								},
								start: {
									character: 9,
									line: 1
								}
							},
							uri: 'file:///a.ts'
						},
						symbol: {
							filePath: 'node_modules/@types/diff/index.d.ts',
							containerKind: '',
							containerName: 'diff',
							kind: 'function',
							name: 'diffChars',
							package: {
								name: '@types/diff',
								version: '0.0.31',
								repoURL: 'https://github.com/DefinitelyTyped/DefinitelyTyped'
							}
						}
					}
				]);
			} as any);
		});
	});

	describe('Workspace with multiple package.json files', function (this: TestContext) {
		beforeEach(initializeTypeScriptService(createHandler, 'file:///', new Map([
			['file:///package.json', JSON.stringify({
				name: 'rootpkg',
				version: '4.0.2',
				dependencies: {
					diff: '3.0.1'
				},
				devDependencies: {
					'@types/diff': '0.0.31'
				}
			})],
			['file:///a.ts', "import * as diff from 'diff';"],
			['file:///foo/b.ts', "import * as resolve from 'resolve';"],
			['file:///foo/package.json', JSON.stringify({
				name: 'foopkg',
				version: '1.0.3',
				dependencies: {
					resolve: '1.1.7'
				},
				devDependencies: {
					'@types/resolve': '0.0.4'
				}
			})]
		])) as any);
		afterEach(shutdownBuildHandler as any);
		describe('textDocumentDefinition()', () => {
			it('should return the location of the diff typings on DefinitelyTyped for the first package.json', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 12
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
					range: {
						start: {
							line: 8,
							character: 18
						},
						end: {
							line: 8,
							character: 24
						}
					}
				}]);
			} as any);
			it('should return the location of the resolve typings on DefinitelyTyped for the second package.json', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///foo/b.ts'
					},
					position: {
						line: 0,
						character: 26
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#resolve/index.d.ts',
					range: {
						start: {
							line: 13,
							character: 0
						},
						end: {
							line: 100,
							character: 0
						}
					}
				}]);
			} as any);
			it('should return both locations when requested concurrently', async function (this: TestContext) {
				const results = await Promise.all([
					this.service.textDocumentDefinition({
						textDocument: {
							uri: 'file:///a.ts'
						},
						position: {
							line: 0,
							character: 12
						}
					}).toArray().map(patches => apply(null, patches)).toPromise(),
					this.service.textDocumentDefinition({
						textDocument: {
							uri: 'file:///foo/b.ts'
						},
						position: {
							line: 0,
							character: 26
						}
					}).toArray().map(patches => apply(null, patches)).toPromise()
				]);
				assert.deepEqual(results, [
					[{
						uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#diff/index.d.ts',
						range: {
							start: {
								line: 8,
								character: 18
							},
							end: {
								line: 8,
								character: 24
							}
						}
					}],
					[{
						uri: 'git://github.com/DefinitelyTyped/DefinitelyTyped#resolve/index.d.ts',
						range: {
							start: {
								line: 13,
								character: 0
							},
							end: {
								line: 100,
								character: 0
							}
						}
					}]
				]);
			} as any);
		});
	} as any);

	describe('Workspace with vendored dependencies', function (this: TestContext) {
		beforeEach(initializeTypeScriptService(createHandler, 'file:///', new Map([
			['file:///package.json', JSON.stringify({
				name: 'rootpkg',
				version: '4.0.2',
				dependencies: {
					diff: '1.0.1'
				}
			})],
			['file:///a.ts', "import { x } from 'diff';"],
			['file:///node_modules/diff/index.d.ts', 'export const x = 1;']
		])) as any);
		afterEach(shutdownBuildHandler as any);
		describe('textDocumentDefinition()', () => {
			it('should return the location of the diff index.d.ts in node_modules', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 9
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'file:///node_modules/diff/index.d.ts',
					range: {
						start: {
							line: 0,
							character: 13
						},
						end: {
							line: 0,
							character: 14
						}
					}
				}]);
			} as any);
		});
	} as any);

	// Disabled due to flakeyness on CI. See https://github.com/sourcegraph/sourcegraph/issues/5637
	describe.skip('Workspace with dependencies with package.json scripts', function (this: TestContext & IContextDefinition) {
		beforeEach(initializeTypeScriptService(createHandler, 'file:///', new Map([
			['file:///package.json', JSON.stringify({
				name: 'rootpkg',
				version: '4.0.2',
				dependencies: {
					'javascript-dep-npm': 'https://github.com/sgtest/javascript-dep-npm'
				}
			})],
			['file:///a.ts', "import * as xyz from 'javascript-dep-npm';"]
		])) as any);
		afterEach(shutdownBuildHandler as any);
		describe('textDocumentDefinition()', () => {
			it('should not run the scripts when getting definition of a symbol', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 12
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/sgtest/javascript-dep-npm#index.d.ts',
					range: {
						start: {
							line: 0,
							character: 0
						},
						end: {
							line: 1,
							character: 0
						}
					}
				}]);
			} as any);
			it('should not run the scripts when getting definition of the module identifier', async function (this: TestContext) {
				const result = await this.service.textDocumentDefinition({
					textDocument: {
						uri: 'file:///a.ts'
					},
					position: {
						line: 0,
						character: 24
					}
				}).toArray().map(patches => apply(null, patches)).toPromise();
				assert.deepEqual(result, [{
					uri: 'git://github.com/sgtest/javascript-dep-npm#index.d.ts',
					range: {
						start: {
							line: 0,
							character: 0
						},
						end: {
							line: 1,
							character: 0
						}
					}
				}]);
			} as any);
		});
	});
});
