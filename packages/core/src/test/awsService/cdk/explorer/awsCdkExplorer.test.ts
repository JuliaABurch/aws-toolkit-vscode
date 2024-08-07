/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as detectCdkProjects from '../../../../awsService/cdk/explorer/detectCdkProjects'
import { CdkAppLocation } from '../../../../awsService/cdk/explorer/cdkProject'
import { CdkRootNode } from '../../../../awsService/cdk/explorer/rootNode'

describe('CdkRootNode', function () {
    it('shows CDK projects', async function () {
        const appLocation: CdkAppLocation = {
            cdkJsonUri: vscode.Uri.file('/cdk.json'),
            treeUri: vscode.Uri.file('/cdk.out/tree.json'),
        }

        sinon.stub(detectCdkProjects, 'detectCdkProjects').resolves([appLocation])

        const treeNodes = await CdkRootNode.instance.getChildren()
        assert.strictEqual(treeNodes.length, 1)
        assert.deepStrictEqual(treeNodes[0].resource, appLocation)
    })
})
