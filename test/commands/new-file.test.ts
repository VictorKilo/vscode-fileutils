import * as retry from 'bluebird-retry';
import * as chai from 'chai';
import { expect } from 'chai';
import * as fs from 'fs-extra-promise';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

import {
    commands,
    TextEditor,
    Uri,
    window,
    workspace
} from 'vscode';

import {
    controller,
    newFile
} from '../../src/extension/commands';

import {
    normalizePath,
    promiseRetry
} from '../helper';

chai.use(sinonChai);

const rootDir = path.resolve(__dirname, '..', '..', '..');
const tmpDir = path.resolve(os.tmpdir(), 'vscode-fileutils-test--new-file');

const fixtureFile1 = path.resolve(rootDir, 'test', 'fixtures', 'file-1.rb');
const fixtureFile2 = path.resolve(rootDir, 'test', 'fixtures', 'file-2.rb');

const editorFile1 = path.resolve(tmpDir, 'nested-dir-1', 'nested-dir-2', 'file-1.rb');
const editorFile2 = path.resolve(tmpDir, 'file-2.rb');

const targetFile = path.resolve(`${editorFile1}.tmp`);

describe('newFile', () => {

    beforeEach(() => promiseRetry({
        promise: Promise.all([
            fs.removeAsync(tmpDir),
            fs.copyAsync(fixtureFile1, editorFile1),
            fs.copyAsync(fixtureFile2, editorFile2)
        ])
    }));

    afterEach(() => fs.removeAsync(tmpDir));

    describe('with open text document', () => {

        beforeEach(() => {

            const openDocument = () => {
                const uri = Uri.file(editorFile1);
                return workspace.openTextDocument(uri)
                    .then((textDocument) => window.showTextDocument(textDocument));
            };

            const stubShowInputBox = () => {
                const fileName = path.basename(targetFile);
                sinon.stub(window, 'showInputBox').returns(Promise.resolve(fileName));
                return Promise.resolve();
            };

            return Promise.all([
                retry(() => openDocument(), { max_tries: 4, interval: 500 }),
                stubShowInputBox()
            ]);
        });

        afterEach(() => {

            const closeAllEditors = () => {
                return commands.executeCommand('workbench.action.closeAllEditors');
            };

            const restoreShowInputBox = () => {
                const stub: any = window.showInputBox;
                return Promise.resolve(stub.restore());
            };

            return Promise.all([
                closeAllEditors(),
                restoreShowInputBox()
            ]);
        });

        it('prompts for file destination', () => {

            return newFile().then(() => {
                const prompt = 'File Name';
                expect(window.showInputBox).to.have.been.calledWithExactly({ prompt });
            });

        });

        it('create file at destination', () => {

            return newFile().then(() => {
                const message = `${targetFile} does not exist`;
                // tslint:disable-next-line:no-unused-expression
                expect(fs.existsSync(targetFile), message).to.be.true;
            });
        });

        describe('new file in non existing nested directories', () => {

            const targetDir = path.resolve(tmpDir, 'level-1', 'level-2', 'level-3');

            beforeEach(() => {
                const stub: any = window.showInputBox;
                stub.returns(Promise.resolve(path.resolve(targetDir, 'file.rb')));
            });

            it('creates nested directories', () => {

                return newFile().then((textEditor: TextEditor) => {
                    const dirname = path.dirname(textEditor.document.fileName);
                    const directories: string[] = dirname.split(path.sep);

                    expect(directories.pop()).to.equal('level-3');
                    expect(directories.pop()).to.equal('level-2');
                    expect(directories.pop()).to.equal('level-1');
                });
            });

        });

        it('opens new file as active editor', () => {

            return newFile().then(() => {
                const activeEditor: TextEditor = window.activeTextEditor;
                expect(activeEditor.document.fileName).to.equal(normalizePath(targetFile));
            });
        });

        // FIXME: controller#showNewFileDialog workspace root is undefined for some reason
        // describe('relative to project root', () => {

        //     it('create file at destination', () => {

        //         return newFile({ relativeToRoot: true }).then(() => {
        //             const message = `${targetFile} does not exist`;
        //             expect(fs.existsSync(targetFile), message).to.be.true;
        //         });
        //     });

        // });

        describe('when target destination exists', () => {

            beforeEach(() => {

                const createTargetFile = () => {
                    return fs.copyAsync(editorFile2, targetFile);
                };

                const stubShowInformationMessage = () => {
                    sinon.stub(window, 'showInformationMessage').returns(Promise.resolve(true));
                    return Promise.resolve();
                };

                return Promise.all([
                    createTargetFile(),
                    stubShowInformationMessage()
                ]);
            });

            afterEach(() => {
                const stub: any = window.showInformationMessage;
                return Promise.resolve(stub.restore());
            });

            it('asks to overwrite destination file', () => {

                const message = `File '${normalizePath(targetFile)}' already exists.`;
                const action = 'Overwrite';
                const options = { modal: true };

                return newFile().then(() => {
                    expect(window.showInformationMessage).to.have.been.calledWith(message, options, action);
                });
            });

            describe('responding with yes', () => {

                it('overwrites the existig file', () => {

                    return newFile().then(() => {
                        const fileContent = fs.readFileSync(targetFile).toString();
                        expect(fileContent).to.equal('');
                    });
                });

            });

            describe('responding with no', () => {

                beforeEach(() => {
                    const stub: any = window.showInformationMessage;
                    stub.returns(Promise.resolve(false));
                    return Promise.resolve();
                });

                it('leaves existing file untouched', () => {

                    return newFile().then(() => {
                        const fileContent = fs.readFileSync(targetFile).toString();
                        expect(fileContent).to.equal('class FileTwo; end');
                    });
                });

            });

        });

    });

    describe('with no open text document', () => {

        beforeEach(() => {

            const closeAllEditors = () => {
                return commands.executeCommand('workbench.action.closeAllEditors');
            };

            const stubShowInputBox = () => {
                sinon.stub(window, 'showInputBox');
                return Promise.resolve();
            };

            return Promise.all([
                closeAllEditors(),
                stubShowInputBox()
            ]);
        });

        afterEach(() => {
            const stub: any = window.showInputBox;
            return Promise.resolve(stub.restore());
        });

        it('ignores the command call', () => {

            return newFile().catch(() => {
                // tslint:disable-next-line:no-unused-expression
                expect(window.showInputBox).to.have.not.been.called;
            });
        });

    });

    describe('error handling', () => {

        beforeEach(() => {
            sinon.stub(controller, 'showNewFileDialog').returns(Promise.reject('must fail'));
            sinon.stub(window, 'showErrorMessage');
            return Promise.resolve();
        });

        afterEach(() => {

            const restoreShowNewFileDialog = () => {
                const stub: any = controller.showNewFileDialog;
                return Promise.resolve(stub.restore());
            };

            const restoreShowErrorMessage = () => {
                const stub: any = window.showErrorMessage;
                return Promise.resolve(stub.restore());
            };

            return Promise.all([
                restoreShowNewFileDialog(),
                restoreShowErrorMessage()
            ]);
        });

        it('shows an error message', () => {

            return newFile().catch((err) => {
                expect(window.showErrorMessage).to.have.been.calledWithExactly('must fail');
            });
        });

    });

});
