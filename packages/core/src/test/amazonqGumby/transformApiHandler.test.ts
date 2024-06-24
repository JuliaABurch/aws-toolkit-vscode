/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { TransformationProgressUpdate, TransformationStep } from '../../codewhisperer/client/codewhispereruserclient'
import {
    downloadResultArchive,
    findDownloadArtifactStep,
    getArtifactsFromProgressUpdate,
} from '../../codewhisperer/service/transformByQ/transformApiHandler'
import { telemetry } from '../../shared/telemetry'
import { CodeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { transformByQState } from '../../codewhisperer/models/model'
import sinon from 'sinon'
import * as cwStreamingClient from '../../shared/clients/codewhispererChatClient'
import * as downloadUtilities from '../../shared/utilities/download'
import { ExportIntent, TransformationDownloadArtifactType } from '@amzn/codewhisperer-streaming'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import { assertTelemetry } from '../testUtil'

describe('Amazon Q Transform - transformApiHandler tests', function () {
    describe('getArtifactIdentifiers', function () {
        it('will return downloaded artifact values from transformationStep', function () {
            const downloadArtifactId = 'hil-test-artifact-id'
            const downloadArtifactType = 'BuiltJars'
            const transformationStepsFixture: TransformationProgressUpdate = {
                name: 'Status step',
                status: 'FAILED',
                description: 'This step should be hil identifier',
                startTime: new Date(),
                endTime: new Date(),
                downloadArtifacts: [
                    {
                        downloadArtifactId,
                        downloadArtifactType,
                    },
                ],
            }
            const { artifactId, artifactType } = getArtifactsFromProgressUpdate(transformationStepsFixture)

            assert.strictEqual(artifactId, downloadArtifactId)
            assert.strictEqual(artifactType, downloadArtifactType)
        })
    })
    describe('findDownloadArtifactStep', function () {
        it('will return downloaded artifact values from transformationStep', function () {
            const downloadArtifactId = 'hil-test-artifact-id'
            const downloadArtifactType = 'BuiltJars'
            const transformationStepsFixture: TransformationStep[] = [
                {
                    id: 'fake-step-id-1',
                    name: 'Building Code',
                    description: 'Building dependencies',
                    status: 'COMPLETED',
                    progressUpdates: [
                        {
                            name: 'Status step',
                            status: 'FAILED',
                            description: 'This step should be hil identifier',
                            startTime: new Date(),
                            endTime: new Date(),
                            downloadArtifacts: [
                                {
                                    downloadArtifactId,
                                    downloadArtifactType,
                                },
                            ],
                        },
                    ],
                    startTime: new Date(),
                    endTime: new Date(),
                },
            ]
            const { transformationStep, progressUpdate } = findDownloadArtifactStep(transformationStepsFixture)

            assert.strictEqual(transformationStep, transformationStepsFixture[0])
            assert.strictEqual(progressUpdate, transformationStepsFixture[0].progressUpdates?.[0])
        })
        it('will return undefined if no downloadArtifactId found', function () {
            const transformationStepsFixture: TransformationStep[] = [
                {
                    id: 'fake-step-id-1',
                    name: 'Building Code',
                    description: 'Building dependencies',
                    status: 'COMPLETED',
                    progressUpdates: [
                        {
                            name: 'Status step',
                            status: 'FAILED',
                            description: 'This step should be hil identifier',
                            startTime: new Date(),
                            endTime: new Date(),
                            downloadArtifacts: undefined,
                        },
                    ],
                    startTime: new Date(),
                    endTime: new Date(),
                },
            ]
            const { transformationStep, progressUpdate } = findDownloadArtifactStep(transformationStepsFixture)

            assert.strictEqual(transformationStep, undefined)
            assert.strictEqual(progressUpdate, undefined)
        })
    })

    describe('downloadResultArchive', () => {
        let createCwStreamingClientStub: sinon.SinonStub
        let downloadExportResultArchiveStub: sinon.SinonStub
        let codeTransformTelemetryStateStub: sinon.SinonStub
        let transformByQStateStub: sinon.SinonStub

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            createCwStreamingClientStub = sinon.stub(cwStreamingClient, 'createCodeWhispererChatStreamingClient')
            downloadExportResultArchiveStub = sinon.stub(downloadUtilities, 'downloadExportResultArchive')

            codeTransformTelemetryStateStub = sinon.stub(CodeTransformTelemetryState.instance, 'getSessionId')
            transformByQStateStub = sinon.stub(transformByQState, 'getJobId')
        })

        afterEach(() => {
            cwStreamingClient.createCodeWhispererChatStreamingClient.restore()
            downloadUtilities.downloadExportResultArchive.restore()

            CodeTransformTelemetryState.instance.getSessionId.restore()
            transformByQState.getJobId.restore()

            sandbox.restore()
        })

        it('should download the result archive successfully', async () => {
            const jobId = 'job-123'
            const downloadArtifactId = 'artifact-abc'
            const pathToArchive = '/path/to/archive.zip'
            const downloadArtifactType = TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS

            const mockClient = { destroy: sinon.stub() }

            createCwStreamingClientStub.resolves(mockClient)
            downloadExportResultArchiveStub.resolves()

            await downloadResultArchive(jobId, downloadArtifactId, pathToArchive, downloadArtifactType)

            assert(createCwStreamingClientStub.calledOnce)
            assert(
                downloadExportResultArchiveStub.calledOnceWith(
                    mockClient,
                    {
                        exportId: jobId,
                        exportIntent: ExportIntent.TRANSFORMATION,
                        exportContext: {
                            transformationExportContext: {
                                downloadArtifactId,
                                downloadArtifactType,
                            },
                        },
                    },
                    pathToArchive
                )
            )

            assert(mockClient.destroy.calledOnce)
        })

        it('should log error and emit telemetry event on download failure', async () => {
            const jobId = 'job-123'
            const downloadArtifactId = 'artifact-abc'
            const pathToArchive = '/path/to/archive.zip'
            const downloadArtifactType = TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS

            const mockClient = { destroy: sinon.stub() }
            const error = new Error('Download error')

            createCwStreamingClientStub.resolves(mockClient)
            downloadExportResultArchiveStub.rejects(error)
            codeTransformTelemetryStateStub.returns('session-id')
            transformByQStateStub.returns(jobId)

            try {
                await downloadResultArchive(jobId, downloadArtifactId, pathToArchive, downloadArtifactType)
            } catch (e) {
                assert.strictEqual(e, error)
                assertTelemetry('codeTransform_logApiError', {
                    codeTransformApiNames: 'ExportResultArchive',
                    codeTransformSessionId: 'session-id',
                    codeTransformJobId: jobId,
                    codeTransformApiErrorMessage: error.message,
                    result: MetadataResult.Fail,
                    reason: 'ExportResultArchiveFailed',
                })

                assert(mockClient.destroy.calledOnce)
            }
        })

        it('should download the result archive successfully without downloadArtifactId', async () => {
            const jobId = 'job-123'
            const pathToArchive = '/path/to/archive.zip'
            const downloadArtifactType = TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS
            const mockClient = { destroy: sinon.stub() }

            createCwStreamingClientStub.resolves(mockClient)
            downloadExportResultArchiveStub.resolves()
            codeTransformTelemetryStateStub.returns('session-id')
            transformByQStateStub.returns(jobId)

            await downloadResultArchive(jobId, undefined, pathToArchive, downloadArtifactType)

            assert(createCwStreamingClientStub.calledOnce)
            assert(
                downloadExportResultArchiveStub.calledOnceWith(
                    mockClient,
                    {
                        exportId: jobId,
                        exportIntent: ExportIntent.TRANSFORMATION,
                    },
                    pathToArchive
                )
            )

            assert(mockClient.destroy.calledOnce)
        })
    })
})
