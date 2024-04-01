
import { Vector3, Mesh, Line, MeshBasicMaterial, LineDashedMaterial, SphereGeometry, ArrowHelper, CylinderGeometry, BufferGeometry, Color, Material, MathUtils } from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EventManager } from "../../../oc/events/EventManager";
import { eUnitType } from "../../_context/Enums";
import { EventsContext } from "../../_context/EventsContext";
import { Op3dContext } from "../../_context/Op3dContext";
import { SceneContext } from "../../scene/SceneContext";
import { Op3dComponentBase } from "../Op3dComponentBase";
import { ChoosePartMode } from "./ChoosePartMode";
import { degToRad } from "three/src/math/MathUtils.js";
import { iEventData } from "../../parts/base_3d/Button3D";
import { OP3DMathUtils } from "../../_utils/OP3DMathUtils";
import { eAngleUnit } from "../part_info/piMoveRotateSection";
import visible from '/images/icons_new/measurement/visible.svg'
import invisible from '/images/icons_new/measurement/invisible.svg'
import angleIcon from '/images/icons_new/measurement/angle.svg'
import edgeIcon from '/images/icons_new/measurement/edge.svg'
import pointIcon from '/images/icons_new/measurement/point.svg'
import radiusIcon from '/images/icons_new/measurement/radius.svg'
import coordinatesIocn from '/images/icons_new/measurement/coordinates.svg'
import dropdownOpened from '/images/icons_new/measurement/opened.svg'
import dropdownClosed from '/images/icons_new/measurement/closed.svg'
import { iEdgeSelectionData, iPart } from "../../parts/PartInterfaces";
import { SimulationRunner } from "../../simulation/SimulationRunner";
import { ColorUtils } from "../ColorUtils";
import { ViewUtils } from "../ViewUtils";
import { eClickObjectType } from "../../parts/absPartsManager";
import store from "../../../reduxStore/store";
import { ePopupTypes } from "../Popup/data/PopupContext";
import { closePopup, togglePopup } from "../Popup/PopupSlice";
import { ThreeJSUtils } from "../../_utils/ThreeJSUtils";
import { DOMUtils } from "../../_utils/DOMUtils";

export enum eChooseState {
    POINTS,
    EDGE,
    ANGLE,
    COORDINATES,
    RADIUS,
    EDGE_ANGLE
}

export enum eLabelType {
    ANGLE,
    LENGTH,
    POINT
}

export interface iEdgeData extends iMeasureData {
    start: Vector3,
    end: Vector3,
    mesh: Mesh | Line

}
export interface iPoint extends iMeasureData {
    center: Vector3,
    mesh: iPart,
}

export interface iMeasureData {
    number: number
    edges: any,
    point: any,
    label: Mesh
}

export class Measurement extends Op3dComponentBase {

    public static INSTANCE: Measurement;

    private mPointsArray: Array<iPoint> = []
    /**
    * @description all points/lines/measure lines located on scene for visualisation
    */
    private mHelperMeshes: Array<Mesh> = [];
    private mEdgesArray: Array<iEdgeData> = []
    public isOpen: boolean
    private mBasicMaterial = new MeshBasicMaterial({ color: 0xFFFFFF, depthWrite: false, depthTest: false })
    public mLineMaterial = new LineDashedMaterial({
        color: 0xFFFFFF,
        scale: 1,
        dashSize: 3,
        gapSize: 1,
        depthWrite: false,
        depthTest: false
    })
    private mCurrentLengthUnit: eUnitType = eUnitType.MILLIMETERS
    private mCurrentAngleUnit = eAngleUnit.DEG
    pMenuBtn: HTMLElement;
    mResetBtn: HTMLElement;
    public mPrevState: Array<{ points: iPoint[]; edges: iEdgeData[]; }> = []
    public mFutureState: Array<{ points: iPoint[]; edges: iEdgeData[]; }> = []

    constructor(pContainer: HTMLElement) {
        super({
            container: pContainer,
            skinPath: './skins/forms/measurement.html',
            closeOnESC: true
        });

    }
    //__________________________________________________________________________________________
    public static get instance() {

        if (null == Measurement.INSTANCE) {
            let aDiv = document.createElement('div');
            aDiv.id = 'measurement_tool_container'
            aDiv.classList.add('modal');
            aDiv.setAttribute("data-backdrop", "false");
            aDiv.style.minWidth = "339px";
            aDiv.style.width = "fit-content";
            aDiv.style.top = "80px";
            aDiv.style.left = "16%";
            aDiv.style.fontSize = "16px";
            aDiv.style.boxShadow = '0px 2.15873px 7.19577px rgba(0, 0, 0, 0.501961)'
            aDiv.style.borderRadius = '5px';
            ($(aDiv)).draggable({
                handle: '.modal-header'
            }
            )
            document.getElementById('forms').appendChild(aDiv);
            Measurement.INSTANCE = new Measurement(aDiv);

        }

        return Measurement.INSTANCE;
    }
    //__________________________________________________________________________________________
    protected _onOpen() {
        this.isOpen = true
        Op3dContext.GLOBAL_MATERIAL.transparent = false
        Op3dContext.PARTS_MANAGER.getSceneObjectsByType(eClickObjectType.OPTICS).forEach(opticPart => opticPart.traverse((optic) => { (optic instanceof Mesh) && (optic.material.transparent = false) }))
        Op3dContext.PARTS_MANAGER.getSceneObjectsByType(eClickObjectType.USER_DEFINED, true).forEach(opticPart => opticPart.traverse((optic) => { (optic instanceof Mesh) && (optic.material.transparent = false) }))
        Op3dContext.SCENE_HISTORY.clearHistory()
    }
    //__________________________________________________________________________________________
    private async showInfo(pElement: HTMLElement) {

        const aBB = DOMUtils.getFirstParentOnSceneRec(pElement).getBoundingClientRect();
        store.dispatch(togglePopup({
            type: ePopupTypes.MEASUREMENT,
            location: JSON.stringify(aBB)
        }))
    }
    //__________________________________________________________________________________________
    /**
    * @description draw and return a Point 
    */
    private drawPoint(pPosition: Vector3) {
        let aPointMesh = new Mesh(new SphereGeometry(0.8), this.mBasicMaterial)
        aPointMesh.position.copy(pPosition)
        this.mHelperMeshes.push(aPointMesh)

        SceneContext.MAIN_SCENE.add(aPointMesh)
        return aPointMesh
    }
    //__________________________________________________________________________________________
    /**
    * @description draw and return a CylinderGeometry line 
    */
    private drawLine(pVector1: Vector3, pVector2: Vector3) {
        let aDirection = new Vector3().subVectors(pVector2, pVector1);
        let aArrow = new ArrowHelper(aDirection.clone().normalize(), pVector1);
        let edgeGeometry = new CylinderGeometry(0.3, 0.3, aDirection.length(), 6, 4);

        let aEdge = new Mesh(edgeGeometry,
            this.mBasicMaterial);
        aEdge.rotation.copy(aArrow.rotation.clone());
        aEdge.position.copy(new Vector3().addVectors(pVector1, aDirection.multiplyScalar(0.5)));

        this.mHelperMeshes.push(aEdge as any)

        SceneContext.MAIN_SCENE.add(aEdge)
        return aEdge
    }
    //__________________________________________________________________________________________
    /**
    * @description remove all helpers meshes from scene
    */
    private deleteMeshHelpers() {
        this.mPointsArray = []
        this.mEdgesArray = []
        for (let mesh of this.mHelperMeshes) {
            SceneContext.MAIN_SCENE.remove(mesh)
        }
        this.mHelperMeshes = []
    }
    //__________________________________________________________________________________________
    /**
    * @description recreate all measures from points and edges
    */
    public async redrawAll(pArrayPoints: Array<iPoint>, pArrayEdge: Array<iEdgeData>) {
        while (pArrayPoints.length > 0 || pArrayEdge.length > 0) {
            if (pArrayPoints.length > 0 && pArrayEdge.length > 0) {
                if (pArrayPoints[0].number < pArrayEdge[0].number) {
                    this.choosePoints(pArrayPoints[0].point, { edges: pArrayPoints[0].edges, part: pArrayPoints[0].mesh })
                    pArrayPoints.shift()
                } else {
                    this.chooseEdge(pArrayEdge[0].point, { edges: pArrayEdge[0].edges, part: pArrayEdge[0].mesh })
                    pArrayEdge.shift()
                }
            } else if (pArrayPoints.length > 0) {
                let aItem = pArrayPoints.shift()
                this.choosePoints(aItem.point, { edges: aItem.edges, part: aItem.mesh })

            } else {
                let aItem = pArrayEdge.shift()
                this.chooseEdge(aItem.point, { edges: aItem.edges, part: aItem.mesh })
            }
        }
    }
    //__________________________________________________________________________________________
    /**
    * @description check edge start/end/middle and drow point depending on mouse event
    */
    private choosePoints(pPoint: iEdgeSelectionData, pEventData: iEventData) {
        let aMeasureObj
        let aPoint = this.drawPoint(pPoint.center)
        let aPointData: iPoint = {
            center: pPoint.center,
            number: this.mPointsArray.length + 1 + this.mEdgesArray.length,
            mesh: pEventData.part,
            point: pPoint,
            edges: pEventData.edges,
            label: undefined,
        }
        this.mPointsArray.push(aPointData)


        const aToFixed = Op3dContext.SETUPS_MANAGER.settings.numericAccuracy;
        if (pPoint.radius != undefined) {
            let aPoint1 = pEventData.edges.edgeMesh.localToWorld(pPoint.start.clone())
            let aPoint2 = pPoint.center
            let aRadius = pPoint.radius

            aRadius = this.convertLengthUnit(aRadius)
            let aLine = this.drawMeasurementLine(aPoint1, aPoint2, true)
            this.fillList(eChooseState.RADIUS, aRadius, [aLine.id])

            let aUnits = this.mCurrentLengthUnit == eUnitType.MILLIMETERS ? 'mm' : 'in'
            aMeasureObj = this.createCSS2ObjectBetweenPoints(aPoint1, aPoint2, 'measure-label',
                `${OP3DMathUtils.toFixed(aRadius, aToFixed)} ${aUnits}`, eChooseState.RADIUS);
            aMeasureObj.userData.meshID = aLine.id;
            (aMeasureObj as any).type = 'RADIUS'
        }

        let aLabelObj = this.createCSS2Object(pPoint.center, `${this.mEdgesArray.length + this.mPointsArray.length}`)
        aPointData.label = aPoint
        aLabelObj.userData.meshID = aPoint.id


        let aPoint1 = this.mPointsArray.at(-1)
        let aPoint2 = this.mPointsArray.at(-2)
        if (aPoint1 && aPoint2) {
            let aDistance = aPoint1.center.distanceTo(aPoint2.center)
            aDistance = this.convertLengthUnit(aDistance)

            let aLine = this.drawMeasurementLine(aPoint1.center, aPoint2.center)
            this.fillList(eChooseState.POINTS, +aDistance, [aLine.id])

            let aUnits = this.mCurrentLengthUnit == eUnitType.MILLIMETERS ? 'mm' : 'in'
            let aLabelObj = this.createCSS2ObjectBetweenPoints(aPoint1.center, aPoint2.center, 'measure-label',
                `${OP3DMathUtils.toFixed(aDistance, aToFixed)} ${aUnits}`,
                eChooseState.COORDINATES);
            aLabelObj.userData.meshID = aLine.id;
        }
    }
    //__________________________________________________________________________________________
    private chooseEdge(pPoint: iEdgeSelectionData, pEventData) {
        let aEdgeVectorData: iEdgeData = {
            start: pPoint.start,
            end: pPoint.end,
            mesh: pEventData.edges.edgeMesh,
            number: this.mEdgesArray.length + 1 + this.mPointsArray.length,
            edges: pEventData.edges,
            point: pPoint,
            label: undefined
        }

        this.mEdgesArray.push(aEdgeVectorData)
        let aPoint1 = pEventData.edges.edgeMesh.localToWorld(aEdgeVectorData.start.clone())
        let aPoint2 = pEventData.edges.edgeMesh.localToWorld(aEdgeVectorData.end.clone())

        let aLine = this.drawLine(aPoint1, aPoint2)

        let aDist = pPoint.dist
        aDist = this.convertLengthUnit(aDist)
        this.fillList(eChooseState.EDGE, aDist, [aLine.id])
        if (this.mEdgesArray.length > 1) {
            this.fillList(eChooseState.EDGE_ANGLE, aDist, [aLine.id, this.mEdgesArray.at(-2).label.id])
        }

        const aToFixed = Op3dContext.SETUPS_MANAGER.settings.numericAccuracy;

        let aUnits = this.mCurrentLengthUnit == eUnitType.MILLIMETERS ? 'mm' : 'in'
        let aLabel = this.createCSS2ObjectBetweenPoints(aPoint1, aPoint2, 'measure-label',
            `${OP3DMathUtils.toFixed(aDist, aToFixed)} ${aUnits}`, eChooseState.EDGE)

        aLabel.userData.meshID = aLine.id

        let aMidpoint = new Vector3();
        aMidpoint.copy(aPoint1);
        aMidpoint.add(aPoint2).multiplyScalar(0.5);
        aMidpoint.y += 7

        let aLabelNumber = this.createCSS2Object(aMidpoint, `${this.mEdgesArray.length + this.mPointsArray.length}`)
        aEdgeVectorData.label = aLine
        aLabelNumber.userData.meshID = aLine.id
    }
    //__________________________________________________________________________________________
    /**
    * @description check the same value in arrays
    */
    private checkPreviousValue(pType: eChooseState, pPart: any, pPoint1: Vector3, pPoint2?: Vector3) {
        switch (pType) {
            case eChooseState.EDGE:
                let aIsEdgeExists = this.mEdgesArray.findIndex(edge => edge.mesh === pPart && (edge.start.equals(pPoint1) && edge.end.equals(pPoint2)))
                return aIsEdgeExists !== -1
            case eChooseState.POINTS:
                let aIsPointExists = this.mPointsArray.findIndex(point => point.mesh === pPart && point.center.equals(pPoint1))
                return aIsPointExists !== -1
        }
    }
    //__________________________________________________________________________________________
    private addToHistory() {
        this.mPrevState.push({
            points: [...this.mPointsArray],
            edges: [...this.mEdgesArray]
        })
    }
    //__________________________________________________________________________________________
    private addToFuture() {
        this.mFutureState.push({
            points: [...this.mPointsArray],
            edges: [...this.mEdgesArray]
        })
    }
    //__________________________________________________________________________________________

    public setMeasure(pPoint: iEdgeSelectionData, _pPart, pEventData: iEventData) {
        if (pPoint.radius != undefined || pPoint.center != undefined) {
            //CASE OF EDGE
            if (!(pPoint.center instanceof Vector3)) {
                if (this.checkPreviousValue(eChooseState.EDGE, pEventData.edges.edgeMesh, pPoint.start, pPoint.end) === false) {
                    this.addToHistory()
                    Op3dContext.SCENE_HISTORY.addToHistory()
                    this.chooseEdge(pPoint, pEventData)



                }
                return
            }

            //CASE OF POINTS
            if (this.checkPreviousValue(eChooseState.POINTS, pEventData.part, pPoint.center) === false) {
                this.addToHistory()
                Op3dContext.SCENE_HISTORY.addToHistory()
                this.choosePoints(pPoint, pEventData)



            }
        }
    }
    //__________________________________________________________________________________________
    /**
    * @description create label between points
    */
    private createCSS2ObjectBetweenPoints(pPoint1: Vector3, pPoint2: Vector3, pClassName: string, pText: string, pType: eChooseState) {
        let aMidpoint = new Vector3();
        aMidpoint.copy(pPoint1);
        aMidpoint.add(pPoint2).multiplyScalar(0.5);

        const aLabelDiv = document.createElement('div');
        aLabelDiv.className = pClassName;
        let aIcon
        switch (pType) {
            case eChooseState.RADIUS:
                aIcon = document.createElement('img')
                aIcon.src = radiusIcon
                break;
            case eChooseState.EDGE:
                aIcon = document.createElement('img')
                aIcon.style.padding = '3.5px'
                aIcon.src = edgeIcon
                break;
            case eChooseState.COORDINATES:
                aIcon = document.createElement('img')
                aIcon.src = coordinatesIocn
                break;
        }

        aLabelDiv.style.fontSize = `15px`

        let aText = document.createElement('div')
        aText.innerHTML = pText
        aText.style.display = 'inline'
        let aWrapper = document.createElement('div')
        aWrapper.style.display = 'flex'
        aWrapper.style.alignItems = 'center'
        aWrapper.appendChild(aIcon)
        aWrapper.appendChild(aText)

        aLabelDiv.appendChild(aWrapper)
        aLabelDiv.style.marginTop = '-1em';
        const aDistLabel = new CSS2DObject(aLabelDiv);
        aDistLabel.position.copy(aMidpoint);
        aDistLabel.userData = { type: eLabelType.LENGTH }
        SceneContext.MAIN_SCENE.add(aDistLabel);
        this.mHelperMeshes.push(aDistLabel as any)
        return aDistLabel
    }
    //__________________________________________________________________________________________
    /**
    * @description create label on angle
    */
    private createCSS2ObjectAngle(pPoint: Vector3, pClassName: string, pText: string) {
        const aLabelDiv = document.createElement('div');
        aLabelDiv.className = pClassName;

        let aIcon = document.createElement('img')
        aIcon.src = angleIcon

        aLabelDiv.style.fontSize = `15px`

        let aText = document.createElement('div')
        aText.innerHTML = pText
        aText.style.display = 'inline'
        aLabelDiv.appendChild(aIcon)
        aLabelDiv.appendChild(aText)
        aLabelDiv.style.marginTop = '-1em';
        const aDistLabel = new CSS2DObject(aLabelDiv);
        aDistLabel.position.copy(pPoint);
        SceneContext.MAIN_SCENE.add(aDistLabel);
        aDistLabel.userData = { type: eLabelType.ANGLE }
        this.mHelperMeshes.push(aDistLabel as any)
        return aDistLabel
    }
    //__________________________________________________________________________________________
    /**
    * @description create point number label
    */
    private createCSS2Object(pPoint: Vector3, pText: string) {

        const aLabelDiv = document.createElement('div');
        aLabelDiv.className = 'measure-label_edge';
        if (pText.length > 1) {
            aLabelDiv.style.padding = '0px 0px'
        }

        aLabelDiv.style.fontSize = `15px`
        aLabelDiv.textContent = pText;

        aLabelDiv.style.marginTop = '-1em';
        const aDistLabel = new CSS2DObject(aLabelDiv);
        aDistLabel.position.copy(pPoint);
        aDistLabel.userData = { type: eLabelType.POINT }
        aDistLabel.position.y += 10
        SceneContext.MAIN_SCENE.add(aDistLabel);
        this.mHelperMeshes.push(aDistLabel as any)
        return aDistLabel
    }
    //__________________________________________________________________________________________
    private getColorDependingOnBackground(): Color {
        const bodyBackgroundColor = ColorUtils.numToHEXColor(Op3dContext.USER_VO.userVO.parameters.simulation.sceneBGColor)
        const backgroundColor = new Color(bodyBackgroundColor);
        const backgroundLuminance = backgroundColor.r * 0.299 + backgroundColor.g * 0.587 + backgroundColor.b * 0.114;

        let lineColor;
        if (backgroundLuminance > 0.5) {
            lineColor = new Color(0x000000);
        } else {
            lineColor = new Color(0xffffff);
        }
        return lineColor
    }
    //__________________________________________________________________________________________
    /**
    * @description draw a line between points
    */
    private drawMeasurementLine(pPoint1: Vector3, pPoint2: Vector3, pIsRadius?: boolean) {
        const aLineGeometry = new BufferGeometry().setFromPoints([pPoint1, pPoint2])

        let aCurrentLine = new Line(
            aLineGeometry,
            this.mLineMaterial
        )

        this.mLineMaterial.color = this.getColorDependingOnBackground()
        let aLineArray = this.mHelperMeshes.filter(item => item instanceof Line && (item.userData.isRad === false))
        let aPreviousLine = aLineArray.at(-1) as any as Line
        if (pIsRadius === true) {
            aCurrentLine.userData.isRad = true
        } else {
            aCurrentLine.userData.isRad = false
        }
        if (aPreviousLine && pIsRadius !== true) {

            let { line, angle, curveCenterPoint } = ThreeJSUtils.createCurveBetween(aPreviousLine as Line, aCurrentLine)
            angle = this.convertAngleUnit(angle)
            this.mHelperMeshes.push(line as any)
            SceneContext.MAIN_SCENE.add(line)
            const aToFixed = Op3dContext.SETUPS_MANAGER.settings.numericAccuracy;
            let aLabel = this.createCSS2ObjectAngle(curveCenterPoint, 'measure-label', OP3DMathUtils.toFixed(angle, aToFixed) + "\u00B0")
            aLabel.userData.meshID = line.id
            this.fillList(eChooseState.ANGLE, angle, [line.id])
        }

        this.mHelperMeshes.push(aCurrentLine as any)
        aCurrentLine.computeLineDistances();
        (aCurrentLine as any).type = pIsRadius ? 'RADIUS' : ''

        SceneContext.MAIN_SCENE.add(aCurrentLine)
        return aCurrentLine
    }

    //__________________________________________________________________________________________
    private convertLengthUnit(pLength: number) {
        if (this.mCurrentLengthUnit == eUnitType.MILLIMETERS) {
            return (pLength)
        } else if (this.mCurrentLengthUnit == eUnitType.INCHES) {
            return (pLength / 25.4)
        }
    }
    //__________________________________________________________________________________________
    private convertAngleUnit(pAngle: number) {
        if (this.mCurrentAngleUnit == eAngleUnit.RAD) {
            return degToRad(pAngle)
        } else if (this.mCurrentAngleUnit == eAngleUnit.DEG) {
            return pAngle
        }
    }
    //__________________________________________________________________________________________
    /**
    * @description highlight measure helper by meshID
    */
    private highlightHelper(pMeshID: Array<number>, pIsEdge: boolean = false, pOnlyNumberLabel: boolean = false) {
        for (let aMesh of pMeshID) {

            let aHelper = this.mHelperMeshes.find(item => item.id === aMesh)
            let aMaterialCopy = (aHelper.material as Material).clone();
            (aMaterialCopy as any).color = new Color('#23A7DE')
            aHelper.material = aMaterialCopy

            if (pOnlyNumberLabel === true) {
                if (pIsEdge === true) {
                    let aHelperLabel = this.mHelperMeshes.filter(item => item.userData.meshID === aMesh) as any
                    aHelperLabel[1].element.style.backgroundColor = '#23A7DE'
                } else {
                    let aHelperLabel = this.mHelperMeshes.filter(item => item.userData.meshID === aMesh) as any
                    for (let helper of aHelperLabel) {
                        helper.element.style.backgroundColor = '#23A7DE'
                    }

                }
            } else {
                if (pIsEdge === true) {
                    let aHelperLabel = this.mHelperMeshes.filter(item => item.userData.meshID === aMesh) as any
                    aHelperLabel[0].element.style.backgroundColor = '#23A7DE'
                } else {
                    let aHelperLabel = this.mHelperMeshes.filter(item => item.userData.meshID === aMesh) as any
                    for (let helper of aHelperLabel) {
                        helper.element.style.backgroundColor = '#23A7DE'
                    }

                }
            }




        }

    }
    //__________________________________________________________________________________________
    private meshVisibility(pMeshID: Array<number>, pToHide: boolean, pIsEdge: boolean) {
        for (let aMesh of pMeshID) {
            let aHelper = this.mHelperMeshes.find(item => item.id === aMesh)
            let aHelperLabel = this.mHelperMeshes.filter(item => item.userData.meshID === aMesh) as any
            if (pIsEdge === true) {
                (aHelperLabel[0] as CSS2DObject).visible = pToHide
            } else {
                for (let helper of aHelperLabel) {
                    (helper as CSS2DObject).visible = pToHide
                }
            }



            aHelper.visible = pToHide
        }
    }
    //__________________________________________________________________________________________
    public clearMeasurements() {
        this.clearMeasureList()
        this.deleteMeshHelpers()
    }
    //__________________________________________________________________________________________
    /**
    * @description delete measure helper by number
    */
    private deleteHelper(pNumber: number) {
        let aPointMatch = [...this.mPointsArray.filter(point => point.number !== pNumber)]
        let aEdgeMatch = [...this.mEdgesArray.filter(point => point.number !== pNumber)]
        this.addToHistory()
        Op3dContext.SCENE_HISTORY.addToHistory()


        this.clearMeasurements()
        this.redrawAll(aPointMatch, aEdgeMatch)
    }
    //__________________________________________________________________________________________
    /**
    * @description reset highlight mesh helpers
    */
    private resetHighlightHelper(pMeshID: Array<number>) {
        for (let aMesh of pMeshID) {
            let aHelper = this.mHelperMeshes.find(item => item.id === aMesh)
            if (aHelper.material instanceof LineDashedMaterial) {
                aHelper.material = this.mLineMaterial
            } else {
                aHelper.material = this.mBasicMaterial
            }

            let aHelperLabel = this.mHelperMeshes.filter(item => item.userData.meshID === aMesh) as any
            for (let helper of aHelperLabel) {
                helper.element.style.backgroundColor = '#7A7A7A'
            }
        }

    }
    //__________________________________________________________________________________________
    private addPointCoords(pMainContainer: HTMLElement, pVector3: Array<Vector3>, pPoint: Array<iPoint>) {
        for (let i = 0; i < pVector3.length; i++) {

            let aDelete = document.createElement('i')
            aDelete.classList.add('icon-close')
            aDelete.addEventListener('click', (event) => {
                event.preventDefault()
                this.deleteHelper(pPoint[i].number)
            })

            const aToFixed = Op3dContext.SETUPS_MANAGER.settings.numericAccuracy;
            let aExtraPoint = document.createElement('div')

            aExtraPoint.addEventListener('mouseenter', () => {
                this.highlightHelper([pPoint[i].label.id])
            })
            aExtraPoint.addEventListener('mouseleave', () => {
                this.resetHighlightHelper([pPoint[i].label.id])
            })

            let aIconItemExtra = document.createElement('img')
            let aText = document.createElement('div')
            aIconItemExtra.src = pointIcon
            aIconItemExtra.style.padding = '3.5px'
            aText.innerHTML = `${pPoint[i].number}: X ${OP3DMathUtils.toFixed(pVector3[i].x, aToFixed)}, Y ${OP3DMathUtils.toFixed(pVector3[i].y, aToFixed)}, Z ${OP3DMathUtils.toFixed(pVector3[i].z, aToFixed)}`
            aExtraPoint.appendChild(aIconItemExtra)
            aExtraPoint.appendChild(aText)
            aExtraPoint.appendChild(aDelete)

            pMainContainer.appendChild(aExtraPoint)
        }


    }
    //__________________________________________________________________________________________

    private addEdgeCoords(pMainContainer: HTMLElement, pVector3: Array<Array<Vector3>>, pPoint: Array<iEdgeData>) {
        for (let i = 0; i < pVector3.length; i++) {
            let aDelete = document.createElement('i')
            aDelete.classList.add('icon-close')
            aDelete.addEventListener('click', (event) => {
                event.preventDefault()
                this.deleteHelper(pPoint[i].number)
            })

            let aExtraPoint = document.createElement('div')

            aExtraPoint.addEventListener('mouseenter', () => {
                this.highlightHelper([pPoint[i].label.id], true, true)
            })
            aExtraPoint.addEventListener('mouseleave', () => {
                this.resetHighlightHelper([pPoint[i].label.id])
            })

            let aIconItemExtra = document.createElement('img')
            let aText1 = document.createElement('div')
            let aText2 = document.createElement('div')
            let aBlockCoordinates = document.createElement('div')
            aBlockCoordinates.style.display = 'flex'
            aBlockCoordinates.style.flexDirection = 'column'
            aBlockCoordinates.style.height = 'inherit'
            aBlockCoordinates.style.gap = 'unset'
            aIconItemExtra.src = pointIcon
            aIconItemExtra.style.padding = '3.5px'
            aBlockCoordinates.appendChild(aText1)
            aBlockCoordinates.appendChild(aText2)
            aText1.innerHTML += `${pPoint[i].number} : X ${pVector3[i][0].x.toFixed(2)}, Y ${pVector3[i][0].y.toFixed(2)}, Z ${pVector3[i][0].z.toFixed(2)}`
            aText2.innerHTML += `${pPoint[i].number} : X ${pVector3[i][1].x.toFixed(2)}, Y ${pVector3[i][1].y.toFixed(2)}, Z ${pVector3[i][1].z.toFixed(2)}`
            aExtraPoint.appendChild(aIconItemExtra)
            aExtraPoint.appendChild(aBlockCoordinates)
            aExtraPoint.appendChild(aDelete)
            aExtraPoint.style.height = '43px'

            pMainContainer.appendChild(aExtraPoint)

        }

    }
    //__________________________________________________________________________________________
    private addMeasureInfo(pMainContainer: HTMLElement, pSubContainer: HTMLElement, pData, pPoints: Array<any>, pTextToShow: string, pIcon) {
        let aLengthUnits = this.mCurrentLengthUnit == eUnitType.MILLIMETERS ? 'mm' : 'in'
        let aAngleUnits = this.mCurrentAngleUnit == eAngleUnit.DEG ? '\u00B0' : 'rad'
        const aToFixed = Op3dContext.SETUPS_MANAGER.settings.numericAccuracy;
        let aIconItem = document.createElement('img')
        let aContentItem = document.createElement('div')

        aIconItem.src = pIcon
        if (pTextToShow === 'Length') {
            aIconItem.style.padding = '3.5px'
        }
        aContentItem.innerHTML = `${pTextToShow}: ${OP3DMathUtils.toFixed(pData, aToFixed)} ${pTextToShow === 'Angle' ? aAngleUnits : aLengthUnits}`

        for (let point of pPoints) {
            let aPointNumber = document.createElement('div')
            aPointNumber.classList.add('measure-label_edge')
            aPointNumber.innerHTML = point.number + ''
            if (aPointNumber.innerHTML.length > 1) {
                aPointNumber.style.padding = '0px 0px'
            }
            pSubContainer.appendChild(aPointNumber)
        }

        pMainContainer.appendChild(pSubContainer)
        pMainContainer.appendChild(aIconItem)
        pMainContainer.appendChild(aContentItem)

    }

    //__________________________________________________________________________________________
    private toggleExtraPointsBlock(aListItem: HTMLElement, aExtraPointsBlock: HTMLElement, aDropdown: HTMLImageElement) {
        if (aListItem.classList.contains('extra_field')) {
            aExtraPointsBlock.style.display = 'none';
            aListItem.classList.remove('extra_field');
            aDropdown.src = dropdownClosed;
        } else {
            aExtraPointsBlock.style.display = 'flex';
            aListItem.classList.add('extra_field');
            aDropdown.src = dropdownOpened;
        }
    }
    //__________________________________________________________________________________________
    private addMainInfoBlock(aMainInfoBlock: HTMLElement, aExtraPointsBlock: HTMLElement, aPointNumberArray: HTMLElement, pData, pType: eChooseState) {
        const aSortedPoints = this.mPointsArray.sort((a, b) => a.number - b.number);
        const aSortedEdges = this.mEdgesArray.sort((a, b) => a.number - b.number);

        switch (pType) {
            case eChooseState.POINTS:
                this.addMeasureInfo(aMainInfoBlock, aPointNumberArray, pData, [aSortedPoints.at(-2), aSortedPoints.at(-1)], 'Distance', coordinatesIocn);
                this.addPointCoords(aExtraPointsBlock, [aSortedPoints.at(-2).center, aSortedPoints.at(-1).center], [aSortedPoints.at(-2), aSortedPoints.at(-1)]);
                break;
            case eChooseState.ANGLE:
                this.addMeasureInfo(aMainInfoBlock, aPointNumberArray, pData, [aSortedPoints.at(-3), aSortedPoints.at(-2), aSortedPoints.at(-1)], 'Angle', angleIcon);
                this.addPointCoords(aExtraPointsBlock, [aSortedPoints.at(-3).center, aSortedPoints.at(-2).center, aSortedPoints.at(-1).center], [aSortedPoints.at(-3), aSortedPoints.at(-2), aSortedPoints.at(-1)]);
                break;
            case eChooseState.EDGE:
                this.addMeasureInfo(aMainInfoBlock, aPointNumberArray, pData, [aSortedEdges.at(-1)], 'Length', edgeIcon);
                this.addEdgeCoords(aExtraPointsBlock, [[aSortedEdges.at(-1).start, aSortedEdges.at(-1).end]], [aSortedEdges.at(-1)]);
                break;
            case eChooseState.EDGE_ANGLE: {
                const lineDirection1 = new Vector3().subVectors(aSortedEdges.at(-1).end, aSortedEdges.at(-1).start);
                const lineDirection2 = new Vector3().subVectors(aSortedEdges.at(-2).end, aSortedEdges.at(-2).start);
                const aAngle = lineDirection1.angleTo(lineDirection2);
                const aAngleDegrees = this.convertAngleUnit(MathUtils.radToDeg(aAngle));
                this.addMeasureInfo(aMainInfoBlock, aPointNumberArray, aAngleDegrees, [aSortedEdges.at(-2), aSortedEdges.at(-1)], 'Angle', angleIcon);
                this.addEdgeCoords(aExtraPointsBlock, [[aSortedEdges.at(-2).start, aSortedEdges.at(-2).end], [aSortedEdges.at(-1).start, aSortedEdges.at(-1).end]], [aSortedEdges.at(-2), aSortedEdges.at(-1)]);
                break;
            }
            case eChooseState.RADIUS:
                this.addMeasureInfo(aMainInfoBlock, aPointNumberArray, pData, [aSortedPoints.at(-1)], 'Radius', radiusIcon);
                this.addPointCoords(aExtraPointsBlock, [aSortedPoints.at(-1).center], [aSortedPoints.at(-1)]);
                break;
        }

    }
    //__________________________________________________________________________________________
    private attachEventListeners(aMainInfoBlock: HTMLElement, pMeshID: Array<number>, pType: eChooseState) {
        aMainInfoBlock.addEventListener('mouseenter', () => this.highlightHelper(pMeshID, pType === eChooseState.EDGE || pType === eChooseState.EDGE_ANGLE));
        aMainInfoBlock.addEventListener('mouseleave', () => this.resetHighlightHelper(pMeshID));

    }
    //__________________________________________________________________________________________
    private fillList(pType: eChooseState, pData, pMeshID: Array<number>) {

        let aPointNumberArray = ViewUtils.createHTMLElement('div', 'points-block')
        let aMainInfoBlock = ViewUtils.createHTMLElement('div', 'measurement-info')
        let aExtraPointsBlock = ViewUtils.createHTMLElement('div', 'extra-block')
        let aListItem = ViewUtils.createHTMLElement('li', 'measurement-item')
        let aDropdown = ViewUtils.createHTMLElement('img') as HTMLImageElement
        aDropdown.src = dropdownClosed

        aListItem.addEventListener('click', () => this.toggleExtraPointsBlock(aListItem, aExtraPointsBlock, aDropdown))
        aListItem.dataset.meshID = pMeshID + ''


        this.addMainInfoBlock(aMainInfoBlock, aExtraPointsBlock, aPointNumberArray, pData, pType)
        aListItem.appendChild(aExtraPointsBlock)
        aMainInfoBlock.prepend(aDropdown)
        this.attachEventListeners(aMainInfoBlock, pMeshID, pType)

        if (pType !== eChooseState.EDGE_ANGLE) {
            this.addShowHideBtn(aMainInfoBlock, pMeshID, pType === eChooseState.EDGE);
        }

        aListItem.prepend(aMainInfoBlock)
        this._getPart('points_list').appendChild(aListItem)
        this._getPart('empty-list').classList.add('d-none')
        ViewUtils.setElementDisabled(this.mResetBtn, false)
    }
    //__________________________________________________________________________________________
    private addShowHideBtn(pMainContainer: HTMLElement, pMeshID: Array<number>, pIsEdge: boolean = false) {
        let aVisibleIcon = document.createElement('img')
        aVisibleIcon.src = visible
        pMainContainer.appendChild(aVisibleIcon)
        aVisibleIcon.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            if (aVisibleIcon.src.includes(visible)) {
                aVisibleIcon.src = invisible
                this.meshVisibility(pMeshID, false, pIsEdge)
            } else {
                aVisibleIcon.src = visible
                this.meshVisibility(pMeshID, true, pIsEdge)
            }

        })
    }
    //__________________________________________________________________________________________
    public clearMeasureList() {
        this._getPart('points_list').innerHTML = ''
        this._getPart('empty-list').classList.remove('d-none')
        ViewUtils.setElementDisabled(this.mResetBtn, true)

    }
    //__________________________________________________________________________________________
    public undo() {
        this.addToFuture()
        this.clearMeasurements()
        let aLastChange = this.mPrevState.pop()
        this.redrawAll(aLastChange.points, aLastChange.edges)

    }
    //__________________________________________________________________________________________
    public redo() {
        this.addToHistory()
        this.clearMeasurements()
        let aLastChange = this.mFutureState.pop()
        this.redrawAll(aLastChange.points, aLastChange.edges)

    }
    //__________________________________________________________________________________________
    protected _onClose() {
        ChoosePartMode.instance.leaveChoosePartMode()
        Op3dContext.DIV_CONTROLLER.sideBar.enable(true);
        this.clearMeasurements()
        this.isOpen = false
        EventManager.dispatchEvent(EventsContext.LEAVE_MEASUREMENT_MODE, this)
        Op3dContext.GLOBAL_MATERIAL.transparent = true
        SimulationRunner.instance.setRaysVisibility();
        // this.showInfo(false)

        store.dispatch(closePopup())
        let aOptionsBlock = this._getPart('options')
        aOptionsBlock.classList.remove('opened')
        this.pMenuBtn.classList.remove('opened')

        Op3dContext.SCENE_HISTORY.clearHistory()

        Op3dContext.PARTS_MANAGER.getSceneObjectsByType(eClickObjectType.OPTICS).forEach(opticPart => opticPart.traverse((optic) => { (optic instanceof Mesh) && (optic.material.transparent = true) }))
        Op3dContext.PARTS_MANAGER.getSceneObjectsByType(eClickObjectType.USER_DEFINED, true).forEach(opticPart => opticPart.traverse((optic) => { (optic instanceof Mesh) && (optic.material.transparent = true) }))
    }
    //__________________________________________________________________________________________
    protected _initElements(): void {
        this.mResetBtn = this._getPart('reset_btn')
        this.mResetBtn.addEventListener('click', () => {
            this.addToHistory()
            Op3dContext.SCENE_HISTORY.addToHistory()
            this.clearMeasurements()
        })
        ViewUtils.setElementDisabled(this.mResetBtn, true)
        this.pMenuBtn = this._getPart('menu_btn')
        this.pMenuBtn.addEventListener('click', () => {

            let aOptionsBlock = this._getPart('options')
            if (aOptionsBlock.classList.contains('opened')) {
                aOptionsBlock.classList.remove('opened')
                this.pMenuBtn.classList.remove('opened')
            } else {
                aOptionsBlock.classList.add('opened')
                this.pMenuBtn.classList.add('opened')
            }
        })
        this._getPart('info_btn').addEventListener('click', (e) => {
            this.showInfo(this.mContainer)
        })
        let aLengthUnit = this._getPart('unit_length-selection')
        aLengthUnit.addEventListener('change', () => this.onChangeLengthUnit(aLengthUnit as HTMLSelectElement))
        let aAngleUnit = this._getPart('unit_angle-selection')
        aAngleUnit.addEventListener('change', () => this.onChangeAngleUnit(aAngleUnit as HTMLSelectElement))
        this._getPart('close_btn').addEventListener('click', () => this.close())
    }
    //__________________________________________________________________________________________
    private onChangeLengthUnit(pElement: HTMLSelectElement) {
        switch (pElement.value) {
            case 'Millimeter':
                if (this.mCurrentLengthUnit == eUnitType.MILLIMETERS) return
                this.mCurrentLengthUnit = eUnitType.MILLIMETERS
                break;
            case 'Inch':
                if (this.mCurrentLengthUnit == eUnitType.INCHES) return
                this.mCurrentLengthUnit = eUnitType.INCHES
                break;
        }
        let aPoints = [...this.mPointsArray]
        let aEdges = [...this.mEdgesArray]
        this.clearMeasurements()
        this.redrawAll(aPoints, aEdges)

    }
    //__________________________________________________________________________________________
    private onChangeAngleUnit(pElement: HTMLSelectElement) {
        switch (pElement.value) {
            case 'Degree':
                if (this.mCurrentAngleUnit == eAngleUnit.DEG) return
                this.mCurrentAngleUnit = eAngleUnit.DEG
                break;
            case 'Radian':
                if (this.mCurrentAngleUnit == eAngleUnit.RAD) return
                this.mCurrentAngleUnit = eAngleUnit.RAD
                break;
        }
        let aPoints = [...this.mPointsArray]
        let aEdges = [...this.mEdgesArray]
        this.clearMeasurements()
        this.redrawAll(aPoints, aEdges)
    }
    //__________________________________________________________________________________________
    protected _onCreationComplete(): void {
        this.mIsReady = true;
    }
    //__________________________________________________________________________________________
}
