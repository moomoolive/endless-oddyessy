import {Quadtree, Vec2, Box2} from "./quadTree"
import {fractionalBMotion, biome} from "./chunkManager"
import {createNoise2D} from "simplex-noise"
import alea from "alea"
import {VertexData, Mesh, StandardMaterial, Color3} from "babylonjs"

const enum voxel {
    air = 0,
    stone = 1,
    grass = 2,
    dirt = 3,
    water = 4,
    sand = 5,
    snow = 6,
    unknown_solid = 7
}

const noise1 = createNoise2D(alea("random")) 

const CHUNK_X_DIMENSION = 64
const CHUNK_Z_DIMENSION = CHUNK_X_DIMENSION
const CHUNK_Y_DIMENSION = 1_024
const CHUNK_Z_LIMITS = [0, CHUNK_Z_DIMENSION - 1] as const
const CHUNK_X_LIMITS = [0, CHUNK_X_DIMENSION - 1] as const
const VOXELS_PER_CHUNK = (
    CHUNK_X_DIMENSION
    * CHUNK_Y_DIMENSION
    * CHUNK_Z_DIMENSION
)
const TERRAIN_MID = 160
const BYTES_PER_CHUNK = VOXELS_PER_CHUNK * Int32Array.BYTES_PER_ELEMENT
const TERRAIN_MAX_X = 4_096
const TERRAIN_MAX_Z = TERRAIN_MAX_X

type n = number
const xaddr = (ptr: n, x: n) => ptr + (x * CHUNK_Z_DIMENSION * CHUNK_Y_DIMENSION)
const zaddr = (z: n, xAddress: n) => (z * CHUNK_Y_DIMENSION) + xAddress
const yaddr = (y: n, zAddress: n) => y + zAddress
const voxaddr = (x: n, y: n, z: n, ptr: n) => yaddr(y, zaddr(z, xaddr(ptr, x)))
const elevationNoise = (x: n, z: n) => fractionalBMotion(noise1, x, z, 200.0, 5, 0.7, 3.0, 1.6)
const moistureNoise = (x: n, z: n) => fractionalBMotion(noise1, x, z, 512.0, 4, 0.5, 4.0, 2.0)

const heightMultipler = ~~(CHUNK_Y_DIMENSION / 2)
const generateHeight = (x: n, z: n) => Math.abs(~~(elevationNoise(x, z) * heightMultipler) + TERRAIN_MID)

const nearestPowerOf2 = (num: number) => 1 << 31 - Math.clz32(num)

const vertexColors = (
    r: number, 
    g: number, 
    b: number, 
    vertexCount: number,
    colors: number[]
) => {
    for (let i = 0; i < vertexCount; i++) {
        colors.push(r, g, b, 0.0)
    }
    return colors
}

const NO_VERTEX = -1
const ensureVertexExist = (
    vertexMap: number[],
    requiredVertex1: number, 
    requiredVertex2: number, 
    requiredVertex3: number, 
    requiredVertex4: number, 
    vertices: number[],
    potentialVertices: number[],
) => {
    const required = [
        requiredVertex1, 
        requiredVertex2, 
        requiredVertex3,
        requiredVertex4
    ]
    for (const requiredVertex of required) {
        if (vertexMap[requiredVertex] === NO_VERTEX) {
            const base = requiredVertex * 3
            const indicesRef = vertices.length / 3
            vertices.push(
                potentialVertices[base],
                potentialVertices[base + 1],
                potentialVertices[base + 2],
            )
            vertexMap[requiredVertex] = indicesRef
        }
    }
}

const culledQuad = (
    indices: number[],
    vertices: number[],
    colors: number[],
    renderNegativeY: boolean,
    renderPositiveY: boolean,
    renderNegativeX: boolean,
    renderPositiveX: boolean,
    renderNegativeZ: boolean,
    renderPositiveZ: boolean,
    xGlobal: number,
    zGlobal: number,
    yGlobal: number,
    voxelType: number,
    levelOfDetail: number,
    skFactor: number
) => {
    if (
        !renderNegativeY 
        && !renderPositiveY
        && !renderNegativeZ 
        && !renderPositiveZ
        && !renderNegativeX 
        && !renderPositiveX
    ) {
        return
    }

    /*
    vertexMap reference (pretty fancy eh?)
       v5+--------+v7  +y  +z
        /|       /|     | /
       / |      / |     + -- +x
    v4+--------+v6|    (reference angle)
      |  |     |  |
      |v1+-----|--+v3
      | /      | /
      |/       |/
    v0+--------+v2 
    */
    
    const vertexMap = [
        NO_VERTEX, NO_VERTEX, NO_VERTEX, NO_VERTEX, // bottom vertices
        NO_VERTEX, NO_VERTEX, NO_VERTEX, NO_VERTEX  // top vertices
    ]
    const f = skFactor
    const potentialVertices = [
        // bottom vertices
        // [(x0,z0), (x0,z1), (x1,z0), (x1,z1)]
        xGlobal + 0, yGlobal + 0, zGlobal + 0,
        xGlobal + 0, yGlobal + 0, zGlobal + f,
        xGlobal + f, yGlobal + 0, zGlobal + 0,
        xGlobal + f, yGlobal + 0, zGlobal + f,
        // top vertices
        // [(x0,z0), (x0,z1), (x1,z0), (x1,z1)]
        xGlobal + 0, yGlobal + 1, zGlobal + 0,
        xGlobal + 0, yGlobal + 1, zGlobal + f,
        xGlobal + f, yGlobal + 1, zGlobal + 0,
        xGlobal + f, yGlobal + 1, zGlobal + f
    ]
    const start = vertices.length / 3

    if (renderNegativeX) {
        ensureVertexExist(
            vertexMap,
            0, 5, 1, 4,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[0], vertexMap[5], vertexMap[1],
            vertexMap[4], vertexMap[5], vertexMap[0],
        )
        //indices.push(
        //    b + 0, b + 5, b + 1,
        //    b + 4, b + 5, b + 0,
        //)
    }
    if (renderPositiveX) {
        ensureVertexExist(
            vertexMap,
            2, 3, 7, 6,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[2], vertexMap[3], vertexMap[7],
            vertexMap[2], vertexMap[7], vertexMap[6],
        )
        //indices.push(
        //    b + 2, b + 3, b + 7,
        //    b + 2, b + 7, b + 6,
        //)
    }

    if (renderNegativeY) {
        ensureVertexExist(
            vertexMap,
            0, 1, 2, 3,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[0], vertexMap[1], vertexMap[2],
            vertexMap[3], vertexMap[2], vertexMap[1],
        )
        //indices.push(
        //    b + 0, b + 1, b + 2,
        //    b + 3, b + 2, b + 1,
        //)
    }

    if (renderPositiveY) {
        ensureVertexExist(
            vertexMap,
            4, 6, 5, 7,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[4], vertexMap[6], vertexMap[5],
            vertexMap[7], vertexMap[5], vertexMap[6],
        )
        //indices.push(
        //    b + 4, b + 6, b + 5,
        //    b + 7, b + 5, b + 6,
        //)
    }

    if (renderNegativeZ) {
        ensureVertexExist(
            vertexMap,
            0, 2, 4, 6,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[0], vertexMap[2], vertexMap[4],
            vertexMap[4], vertexMap[2], vertexMap[6]
        )
        //indices.push(
        //    b + 0, b + 2, b + 4,
        //    b + 4, b + 2, b + 6,
        //)
    }
    
    if (renderPositiveZ) {
        ensureVertexExist(
            vertexMap,
            1, 5, 3, 7,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[1], vertexMap[5], vertexMap[3],
            vertexMap[5], vertexMap[7], vertexMap[3],
        )
        //indices.push(
        //    b + 1, b + 5, b + 3,
        //    b + 5, b + 7, b + 3,
        //)
    }
    const vCount = vertices.length / 3 - start

    switch (levelOfDetail) {
        case 1:
            vertexColors(0.0, 1.0, 0.0, vCount, colors)
            break
        case 2:
            vertexColors(0.0, 0.0, 1.0, vCount, colors)
            break
        case 3:
            vertexColors(1.0, 0.0, 0.0, vCount, colors)
            break
        default: {
            const det = (levelOfDetail * 0.1)
            const bas = 0.2
            const n = det + bas
            vertexColors(n, n, n, vCount, colors)
        }
    }
}

const logarithm = (base: number, x: number) => Math.log(x) / Math.log(base)
const baseLod = logarithm(2, CHUNK_X_DIMENSION)

const lod = (size: number) => (logarithm(2, size) - baseLod) + 1
const skipFactor = (levelOfDetail: number) => (2 ** (baseLod + levelOfDetail - 1)) / CHUNK_X_DIMENSION

const visitedIndex = (x: number, y: number, z: number) => x * CHUNK_Z_DIMENSION * CHUNK_Y_DIMENSION + z * CHUNK_Y_DIMENSION + y

type AxisIterator = [number, number, number]
const greedyQuadIter = [0, 0, 0] as AxisIterator
const greedyQuadFace = [0, 0, 0] as AxisIterator

interface VoxelChecker {
    getVoxel: (x: number, y: number, z: number) => number
}

type VoxelBuffer = Int32Array
type AxisRef = 0 | 1 | 2
const greedyQuad = (
    mainAxis: AxisRef,
    mainAxisStart: number,
    mainAxisLimit: number,
    mainGlobalCoord: number,
    altAxis: AxisRef,
    altAxisStart: number,
    altAxisLimit: number,
    altGlobalCoord: number,
    tertiaryAxis: AxisRef,
    tertiaryAxisStart: number,
    teritaryAxisLimit: number,
    tertiaryGlobalCoord: number,
    visitedArr: Uint8Array,
    targetType: number,
    positiveAxis: boolean,
    axisFlag: number,
    lodFactor: number,
    vertices: number[],
    voxels: VoxelChecker
) => {
    let mainAxisEnd = mainAxisStart + 1
    let altAxisEnd = altAxisStart + 1
    const faceCheckOffset = positiveAxis ? 1 : -1

    const iter = greedyQuadIter
    iter[altAxis] = altAxisStart
    iter[tertiaryAxis] = tertiaryAxisStart
    iter[mainAxis] = mainAxisEnd
    const face = greedyQuadFace
    face[altAxis] = altAxisStart
    face[tertiaryAxis] = tertiaryAxisStart + faceCheckOffset
    face[mainAxis] = mainAxisEnd
    while (mainAxisEnd < mainAxisLimit) {
        iter[mainAxis] = mainAxisEnd
        const vIdx = visitedIndex(...iter)
        face[mainAxis] = mainAxisEnd
        const visited = visitedArr[vIdx] & axisFlag
        if (
            visited
            // next voxel is not same type
            //|| vbuf[voxaddr(...iter, vptr)] !== targetType 
            || voxels.getVoxel(...iter) !== targetType 
            // next voxel does not have same exposed face
            //|| !(tertiaryAxisStart > teritaryAxisLimit - 2
            //    ? true
            //    : vbuf[voxaddr(...face, vptr)] === voxel.air)
            || !(tertiaryAxisStart > teritaryAxisLimit - 2
                ? true
                : voxels.getVoxel(...face) === voxel.air)
        ) {
            break
        }
        visitedArr[vIdx] |= axisFlag
        mainAxisEnd++
    }

    let loop = true
    while (altAxisEnd < altAxisLimit) {
        const start = mainAxisStart
        const end = mainAxisEnd
        iter[altAxis] = altAxisEnd
        iter[tertiaryAxis] = tertiaryAxisStart
        face[altAxis] = altAxisEnd
        face[tertiaryAxis] = tertiaryAxisStart + faceCheckOffset
        for (let main = start; main < end; main++) {
            iter[mainAxis] = main
            const vIdx = visitedIndex(...iter)
            const visited = visitedArr[vIdx] & axisFlag
            face[mainAxis] = main
            if (
                visited
                // next voxel is same type
                //|| vbuf[voxaddr(...iter, vptr)] !== targetType 
                || voxels.getVoxel(...iter) !== targetType 
                // next voxel has the same exposed face
                //|| !(tertiaryAxisStart > teritaryAxisLimit - 2
                //    ? true
                //    : vbuf[voxaddr(...face, vptr)] === voxel.air)
                || !(tertiaryAxisStart > teritaryAxisLimit - 2
                    ? true
                    : voxels.getVoxel(...face) === voxel.air)
            ) {
                loop = false
                break
            }
        }
        if (!loop) {
            break
        }
        iter[altAxis] = altAxisEnd
        iter[tertiaryAxis] = tertiaryAxisStart
        for (let main = start; main < end; main++) {
            iter[mainAxis] = main
            const vIdx = visitedIndex(...iter)
            visitedArr[vIdx] |= axisFlag
        }
        altAxisEnd++
    }

    const vStart = vertices.length / 3                    
    const minAlt = altGlobalCoord
    const axisConstant = positiveAxis ? 1 : 0
    let minTertiary = tertiaryGlobalCoord
    const minMain = mainGlobalCoord
    const maxAlt = minAlt + (altAxisEnd - altAxisStart) * lodFactor
    let maxTertiary = 0
    let maxMain = minMain
    if (mainAxis === 1) {
        minTertiary += lodFactor * axisConstant
        maxMain += (mainAxisEnd - mainAxisStart)
    } else {
        minTertiary += axisConstant
        maxMain += (mainAxisEnd - mainAxisStart) * lodFactor
    }
    maxTertiary = minTertiary
    iter[altAxis] = minAlt
    iter[tertiaryAxis] = minTertiary
    iter[mainAxis] = minMain
    vertices.push(...iter)
    
    iter[altAxis] = maxAlt
    vertices.push(...iter)
    
    iter[altAxis] = minAlt
    iter[mainAxis] = maxMain
    vertices.push(...iter)
    
    iter[altAxis] = maxAlt
    iter[tertiaryAxis] = maxTertiary
    vertices.push(...iter)
    return vStart
}

const createColor = (
    levelOfDetail: number, 
    vertexCount: number,
    colors: number[]
) => {
    switch (levelOfDetail) {
        case 1:
            vertexColors(0.0, 1.0, 0.0, vertexCount, colors)
            break
        case 2:
            vertexColors(1.0, 0.0, 1.0, vertexCount, colors)
            break
        case 3:
            vertexColors(1.0, 0.0, 0.0, vertexCount, colors)
            break
        default: {
            const det = (levelOfDetail * 0.1)
            const bas = 0.2
            const n = det + bas
            vertexColors(n, n, n, vertexCount, colors)
        }
    }
}

class VoxelInterval {
    static null() {
        return new VoxelInterval(NO_VOXEL, NO_LENGTH)
    }

    type: number
    length: number

    constructor(type: number, length: number) {
        this.type = type
        this.length = length
    }

    isNull() {
        return this.type === NO_VOXEL
    }
}

type VoxelRun = VoxelInterval[]
const NO_LENGTH = -1
const NO_VOXEL = -1

class VoxelRunIterator {
    run: VoxelRun
    end: number
    type: number
    start: number
    nextRun: number
    runX: number
    runZ: number

    constructor(run: VoxelRun, x: number, z: number) {
        this.run = run
        this.end = run.length
        this.nextRun = 0
        this.runX = x
        this.runZ = z
        this.start = 0
        this.type = NO_VOXEL
    }

    reset(run: VoxelRun, x: number, z: number) {
        this.run = run
        this.runX = x
        this.runZ = z
        this.start = 0
        this.end = 0
        this.type = NO_VOXEL
        this.nextRun = 0
        return this
    }

    iter() {
        if (!this.hasNext()) {
            return false
        }
        this.start = this.end
        const next = this.run[this.nextRun]
        this.type = next.type
        this.end += next.length
        this.nextRun++
        return true
    }

    iterTo(y: number) {
        if (y <= this.end) {
            return this.reverseTo(y)
        } else {
            return this.forwardTo(y)
        }
    }

    forwardTo(y: number) {
        while (y > this.end && this.iter()) {}
        return false
    }

    iterRev() {
        if (!this.hasPrevious()) {
            return false
        }
        this.end = this.start
        const prev = this.run[this.nextRun - 2]
        this.type = prev.type
        this.start -= prev.length
        this.nextRun--
        return true
    }

    reverseTo(y: number) {
        while (y > this.end && this.iterRev()) {}
        return false
    }

    hasNext() {
        return this.nextRun < this.run.length
    }

    hasPrevious() {
        return this.nextRun > 1
    }

    isNull() {
        return this.run.length < 1 || this.run[0].isNull()
    }

    isSolid() {
        return this.type !== NO_VOXEL && this.type !== voxel.air 
    }

    firstAirVoxel() {
        if (this.isNull()) {
            return CHUNK_Y_DIMENSION
        }
        const runs = this.run
        const startRun = runs[0]
        let type = startRun.type
        let start = 0
        let end = startRun.length
        let nextRun = 1
        const totalRuns = runs.length
        while (nextRun < totalRuns && type !== voxel.air) {
            start = end
            const next = runs[nextRun]
            type = next.type
            end += next.length
            nextRun++
        }
        return start
    }
}

const NULL_VOXEL_RUN = [VoxelInterval.null()]

class VoxelColumnIterator {
    target: VoxelRunIterator
    left: VoxelRunIterator
    right: VoxelRunIterator
    front: VoxelRunIterator
    back: VoxelRunIterator
    currentY: number

    constructor(run: VoxelRun, x: number, z: number) {
        this.target = new VoxelRunIterator(run, x, z)
        this.left = new VoxelRunIterator(run, x, z)
        this.right = new VoxelRunIterator(run, x, z)
        this.front = new VoxelRunIterator(run, x, z)
        this.back = new VoxelRunIterator(run, x, z)
        this.currentY = 0
    }

    height() {
        const col = this.target.run
        let currentRun = col.length - 1
        let height = CHUNK_Y_DIMENSION
        while (col[currentRun].type === voxel.air) {
            height -= col[currentRun].length
            currentRun--
        }
        return height + 1
    }

    reset(
        targetX: number,
        targetZ: number,
        target: VoxelRun,
        left: VoxelRun,
        right: VoxelRun,
        back: VoxelRun,
        front: VoxelRun,
    ) {
        this.target.reset(target, targetX, targetZ)
        this.left.reset(left, targetX - 1, targetZ)
        this.right.reset(right, targetX + 1, targetZ)
        this.back.reset(back, targetX, targetZ - 1)
        this.front.reset(front, targetX, targetZ + 1)
        return this
    }

    currentVoxel() {
        return this.target.type
    }

    iterTo(y: number) {
        this.target.forwardTo(y)
        this.currentY = y
    }

    topVoxel() {
        const y = this.currentY + 1
        if (this.target.end >= y) {
            return this.target.type
        } else if (this.target.hasNext()) {
            return this.target.run[this.target.nextRun].type
        } else {
            return voxel.unknown_solid
        }
    }

    bottomVoxel() {
        const y = this.currentY - 1
        if (this.target.start <= y) {
            return this.target.type
        } else if (this.target.hasPrevious()) {
            return this.target.run[this.target.nextRun - 2].type
        } else {
            return voxel.air
        } 
    }

    rightVoxel() {
        this.right.forwardTo(this.currentY)
        return this.right.type
    }

    leftVoxel() {
        this.left.forwardTo(this.currentY)
        return this.left.type
    }

    frontVoxel() {
        this.front.forwardTo(this.currentY)
        return this.front.type
    }

    backVoxel() {
        this.back.forwardTo(this.currentY)
        return this.back.type
    }

    firstExposedFace() {
        const left = this.left.firstAirVoxel()
        const right = this.right.firstAirVoxel()
        const front = this.front.firstAirVoxel()
        const back = this.back.firstAirVoxel()
        const target = this.target.firstAirVoxel() - 1
        const lowest = Math.min(left, right, front, back, target)
        return lowest
    }
}

type Ptr = number
type RunPointers = Ptr[]

const enum axis_flags {
    positive_z = 1 << 0,
    negative_z = 1 << 1,
    positive_x = 1 << 2,
    negative_x = 1 << 3,
    positive_y = 1 << 4,
    negative_y = 1 << 5,
    all_flags = (
        positive_x
        + negative_x
        + positive_y
        + negative_y
        + positive_z
        + negative_z
    )
}

let wireframeShader: StandardMaterial

class Chunk {
    center: Vec2
    bounds: Box2
    dimensions: Vec2
    levelOfDetail: number
    key: string
    //voxelBuffer: VoxelBuffer
    vertexData: VertexData
    mesh: Mesh
    isRendered: boolean
    simulationDelta: number 
    meshingDelta: number
    skirtDelta: number
    mostRecentSimulationRendered: boolean
    colors: number[]
    vertices: number[]
    faces: number[]
    meshMethod: string
    runPtrs: RunPointers
    runs: VoxelRun[]
    readonly id: string

    private iter: VoxelRunIterator
    private columnIter: VoxelColumnIterator
    
    constructor({
        center = Vec2.default(),
        bounds = Box2.default(),
        dimensions = Vec2.default(),
        levelOfDetail = 1,
        key = "0.0[16]",
        id = "terrain-chunk-1",
    } = {}) {
        this.id = id
        this.vertices = []
        this.faces = []
        this.colors = []
        this.key = key
        this.center = center
        this.bounds = bounds
        this.dimensions = dimensions
        this.levelOfDetail = Math.max(levelOfDetail, 1)
        //const bytes = new SharedArrayBuffer(BYTES_PER_CHUNK)
        //this.voxelBuffer = new Int32Array(0)
        this.vertexData = new VertexData()
        this.mesh = new Mesh(id)
        this.isRendered = false
        this.mostRecentSimulationRendered = false
        this.simulationDelta = 0.0
        this.meshingDelta = 0.0
        this.skirtDelta = 0.0
        this.meshMethod = "none"

        this.runPtrs = []
        this.runs = []
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const ptr = this.runs.length
                const run = []
                this.runs.push([
                    VoxelInterval.null(),
                    VoxelInterval.null(),
                ])
                this.runPtrs.push(ptr)
            }
        }

        const startX = 0
        const startZ = 0
        const startRun = this.getRun(startX, startZ)
        this.iter = new VoxelRunIterator(startRun, startX, startZ)
        this.columnIter = new VoxelColumnIterator(startRun, startX, startZ)
    }

    getRun(x: number, z: number) {
        const ptrRef = z * CHUNK_X_DIMENSION + x
        const ptr = this.runPtrs[ptrRef]
        return this.runs[ptr]
    }

    getVoxel(x: number, y: number, z: number) {
        const runs = this.getRun(x, z)
        const startRun = runs[0]
        let type = startRun.type
        let end = startRun.length
        let nextRun = 1
        const totalRuns = runs.length
        while (nextRun < totalRuns && end < y) {
            const next = runs[nextRun]
            type = next.type
            end += next.length
            nextRun++
        }
        return type
    }

    getRunIterator(x: number, z: number) {
        const run = this.getRun(x, z)
        return this.iter.reset(run, x, z)

    }

    columnLastSolidVoxel(x: number, z: number) {
        const col = this.getRun(x, z)
        let currentRun = col.length - 1
        let height = CHUNK_Y_DIMENSION
        while (col[currentRun].type === voxel.air) {
            height -= col[currentRun].length
            currentRun--
        }
        return height
    }

    getColumnHeight(x: number, z: number) {
        return this.columnLastSolidVoxel(x, z) + 1
    }

    getColumnIterator(x: number, z: number) {
        const target = this.getRun(x, z)
        const left = x < 1 
            ? NULL_VOXEL_RUN 
            : this.getRun(x - 1, z)
        const right = x > CHUNK_X_DIMENSION - 2
            ? NULL_VOXEL_RUN 
            : this.getRun(x + 1, z)
        const back = z < 1
            ? NULL_VOXEL_RUN
            : this.getRun(x, z - 1)
        const front = z > CHUNK_Z_DIMENSION - 2
            ? NULL_VOXEL_RUN
            : this.getRun(x, z + 1)
        return this.columnIter.reset(
            x, z,
            target, left, right, back, front
        )
    }

    heightMapSimulation(heightMap: HeightMap) {
        const start = Date.now()
        this.levelOfDetail = Math.max(this.levelOfDetail, 1)
        const {levelOfDetail} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const divisionFactor = nearestPowerOf2(heightMap.height)
        const div = TERRAIN_MAX_X / divisionFactor
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originx + x * skFactor
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originz + z * skFactor
                const percent = heightMap.getHeight(
                    ~~(xGlobal / div),
                    ~~(zGlobal / div),
                )
                const calcHeight = ~~(percent)
                const greaterThanMin = Math.max(calcHeight, 1)
                const lesserThanMax = Math.min(greaterThanMin, CHUNK_Y_DIMENSION)
                const height = lesserThanMax
                const moisture = moistureNoise(xGlobal, zGlobal)
                const currentRun = this.getRun(x, z) 
                // hard code for now
                const biomeRun = currentRun[0]
                biomeRun.type = biome(height - 1, moisture)
                biomeRun.length = height

                const airRunLength = CHUNK_Y_DIMENSION - height
                const airRun = currentRun[1]
                airRun.type = voxel.air
                airRun.length = airRunLength
                
                //for (let y = 0; y < height; y++) {
                //    const v = yaddr(y, addressComputed)
                //    voxelBuffer[v] = biomeType
                //}
                //// zero out the rest
                //// think of a more efficent way later?
                //for (let y = height; y < CHUNK_Y_DIMENSION; y++) {
                //    const v = yaddr(y, addressComputed)
                //    voxelBuffer[v] = voxel.air
                //}
            }
        }
        this.simulationDelta = Date.now() - start
        this.mostRecentSimulationRendered = false
    }

    /*
    simulate() {
        const start = Date.now()
        this.levelOfDetail = Math.max(this.levelOfDetail, 1)
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const skFactor = skipFactor(levelOfDetail)
        const prevXRow = []
        for (let i = 0; i < CHUNK_Z_DIMENSION; i++) {
            prevXRow.push(0)
        }
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originx + x * skFactor
            let prevZHeight = -100
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originz + z * skFactor
                const calcHeight = generateHeight(xGlobal, zGlobal)
                const initHeight = Math.max(calcHeight, 1)
                let height = initHeight
                const highestDetail = levelOfDetail < 2
                const prevZDiff = Math.abs(prevZHeight - height)
                if (
                    highestDetail
                    || prevZDiff >= skFactor
                ) {
                    prevZHeight = height
                } else {
                    height = prevZHeight
                }
                const prevXDiff = Math.abs(prevXRow[z] - height)
                if (
                    levelOfDetail > 1
                    && z > 1
                    && prevXDiff < skFactor
                ) {
                    height = prevXRow[z]
                }
                prevXRow[z] = height
                const moisture = moistureNoise(xGlobal, zGlobal)
                const biomeType = biome(height - 1, moisture)
                for (let y = 0; y < height; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = biomeType
                }
                // zero out the rest
                // think of a more efficent way later?
                for (let y = height; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = voxel.air
                }
            }
        }
        this.simulationDelta = Date.now() - start
        this.mostRecentSimulationRendered = false
    }
    */

    /*
    culledMesh() {
        const start = Date.now()
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                
                for (let y = 0; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, zaddress)
                    const type = voxelBuffer[v]
                    if (type === voxel.air) {
                        continue
                    }

                    const renderNegativeY = (
                        y > 0 
                        && voxelBuffer[v - 1] === voxel.air
                    )
                    const renderPositiveY = y > CHUNK_Y_DIMENSION - 2
                        ? true
                        : voxelBuffer[v + 1] === voxel.air

                    const renderNegativeX = x < 1 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal - 1, y, zGlobal)
                        : voxelBuffer[voxaddr(x - 1, y, z, ptr)] === voxel.air
                    const renderPositiveX = x > CHUNK_X_DIMENSION - 2 
                        ? false //!this.globalRef.isVoxelSolid(xGlobal + 1, y, zGlobal)
                        : voxelBuffer[voxaddr(x + 1, y, z, ptr)] === voxel.air

                    const renderNegativeZ = z < 1 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal, y, zGlobal - 1)
                        : voxelBuffer[voxaddr(x, y, z - 1, ptr)] === voxel.air
                    const renderPositiveZ = z > CHUNK_Z_DIMENSION - 2 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal, y, zGlobal + 1)
                        : voxelBuffer[voxaddr(x, y, z + 1, ptr)] === voxel.air
                    
                    culledQuad(
                        indices, vertices, colors,
                        renderNegativeY, renderPositiveY,
                        renderNegativeX, renderPositiveX,
                        renderNegativeZ, renderPositiveZ,
                        xGlobal, zGlobal, y, type,
                        levelOfDetail, skFactor
                    )
                }
            }
        }
        this.vertices = vertices
        this.faces = indices
        this.colors = colors
        this.meshMethod = "culled"
        this.createSkirt()
        this.meshingDelta = Date.now() - start
    }
    */

    greedyMesh() {
        const start = Date.now()
        const {levelOfDetail} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        const skFactor = skipFactor(levelOfDetail)
        const sliceVolume = (
            CHUNK_Y_DIMENSION 
            * CHUNK_X_DIMENSION
            * CHUNK_Z_DIMENSION
        )
        const visitedArray = new Uint8Array(sliceVolume)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                const column = this.getColumnIterator(x, z)
                const start = column.firstExposedFace()
                const height = column.height()
                for (let y = start; y < height; y++) {
                    const v = yaddr(y, zaddress)
                    const visitedRef = visitedIndex(x, y, z)
                    const visited = visitedArray[visitedRef]
                    if (visited === axis_flags.all_flags) {
                        continue
                    }
                    column.iterTo(y)
                    const type = column.currentVoxel()
                    if (type === voxel.air) {
                        visitedArray[visitedRef] = axis_flags.all_flags
                        continue
                    }
                    
                    //const renderPositiveY = y > CHUNK_Y_DIMENSION - 2
                    //    ? true
                    //    : column.topVoxel() === voxel.air //this.getVoxel(x, y + 1, z) === voxel.air
                    const positiveYAxisVisited = visited & axis_flags.positive_y
                    if (
                        !positiveYAxisVisited
                        && column.topVoxel() === voxel.air
                    ) {
                        const vStart = greedyQuad(
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            visitedArray,
                            type,
                            true,
                            axis_flags.positive_y,//positiveYbit,
                            skFactor,
                            vertices,
                            this
                        )
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }
                    //const renderNegativeY = (
                    //    y > 0 
                    //    && this.getVoxel(x, y - 1, z) === voxel.air
                    //)
                    const negativeYAxisVisited = visited & axis_flags.negative_y
                    if (
                        !negativeYAxisVisited
                        && y > 0
                        && column.bottomVoxel() === voxel.air
                    ) {
                        const vStart = greedyQuad(
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            visitedArray,
                            type,
                            false,
                            axis_flags.negative_y,//negativeYbit,
                            skFactor,
                            vertices,
                            this
                        )
                        // not sure if this has the correct normals
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    //const renderPositiveX = x > CHUNK_X_DIMENSION - 2 
                    //    ? false
                    //    : this.getVoxel(x + 1, y, z) === voxel.air
                    const positiveXAxisVisited = visited & axis_flags.positive_x
                    if (
                        !positiveXAxisVisited
                        && x < CHUNK_X_DIMENSION - 1
                        && column.rightVoxel() === voxel.air
                    ) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            visitedArray,
                            type,
                            true,
                            axis_flags.positive_x,//positiveXbit,
                            skFactor,
                            vertices,
                            this
                        )
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    //const renderNegativeX = x < 1 
                    //    ? false
                    //    : this.getVoxel(x - 1, y, z) === voxel.air
                    const negativeXAxisVisited = visited & axis_flags.negative_x
                    if (
                        !negativeXAxisVisited
                        && x > 0
                        && column.leftVoxel() === voxel.air
                    ) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            visitedArray,
                            type,
                            false,
                            axis_flags.negative_x,//negativeXbit,
                            skFactor,
                            vertices,
                            this
                        )
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    //const renderPositiveZ = z > CHUNK_Z_DIMENSION - 2 
                    //    ? false
                    //    : this.getVoxel(x, y, z + 1) === voxel.air
                    const positiveZAxisVisited = visited & axis_flags.positive_z
                    if (
                        !positiveZAxisVisited
                        && z < CHUNK_Z_DIMENSION - 1
                        && column.frontVoxel() === voxel.air
                    ) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            visitedArray,
                            type,
                            true,
                            axis_flags.positive_z,//positiveZbit,
                            skFactor,
                            vertices,
                            this
                        )
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    //const renderNegativeZ = z < 1 
                    //    ? false
                    //    : this.getVoxel(x, y, z - 1) === voxel.air
                    const negativeZAxisVisited = visited & axis_flags.negative_z
                    if (
                        !negativeZAxisVisited
                        && z > 0
                        && column.backVoxel() === voxel.air
                    ) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            visitedArray,
                            type,
                            false,
                            axis_flags.negative_z,//negativeZbit,
                            skFactor,
                            vertices,
                            this
                        )
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }
                }
            }
        }
        this.meshMethod = "greedy"
        this.colors = colors
        this.vertices = vertices
        this.faces = indices
        this.createSkirt()
        this.meshingDelta = Date.now() - start
    }

    createSkirt() {
        const start = Date.now()
        const {levelOfDetail} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices = this.faces
        const vertices = this.vertices
        const colors = this.colors
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            for (const z of CHUNK_Z_LIMITS) {
                const zGlobal = originz + z * skFactor
                const voxels = this.getRunIterator(x, z)
                while (voxels.iter()) {
                    if (voxels.type === voxel.air) {
                        continue
                    }
                    const positiveAxis = z > 0
                    const maxX = xGlobal + skFactor
                    const vStart = vertices.length / 3
                    const targetZ = positiveAxis 
                        ? zGlobal + skFactor
                        : zGlobal
                    const actualMinY = voxels.start
                    const actualMaxY = voxels.end + 1
                    vertices.push(
                        xGlobal, actualMinY, targetZ,
                        maxX, actualMinY, targetZ,
                        xGlobal, actualMaxY, targetZ,
                        maxX, actualMaxY, targetZ,
                    )
                    if (positiveAxis) {
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                    } else {
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                    }
                    createColor(levelOfDetail, 4, colors)
                }
            }
        }

        for (const x of CHUNK_X_LIMITS) {
            const xGlobal = originx + x * skFactor
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const voxels = this.getRunIterator(x, z)
                while (voxels.iter()) {
                    if (voxels.type === voxel.air) {
                        continue
                    }
                    const positiveAxis = x > 0
                    const maxZ = zGlobal + skFactor
                    const vStart = vertices.length / 3
                    const targetX = positiveAxis 
                        ? xGlobal + skFactor
                        : xGlobal
                    const actualMinY = voxels.start
                    const actualMaxY = voxels.end + 1
                    vertices.push(
                        targetX, actualMinY, zGlobal,
                        targetX, actualMinY, maxZ,
                        targetX, actualMaxY, zGlobal,
                        targetX, actualMaxY, maxZ,
                    )
                    if (positiveAxis) {
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                    } else {
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                    }
                    createColor(levelOfDetail, 4, colors)
                }
            }
        }
        this.skirtDelta = Date.now() - start
    }

    render({
        wireframe = false,
        logStats = false
    } = {}) {
        const {faces, vertices, colors, vertexData: vd, mesh} = this
        vd.indices = faces
        vd.positions = vertices
        if (wireframe) {
            if (!wireframeShader) {
                wireframeShader = new StandardMaterial("wireframe" + Date.now())
                wireframeShader.emissiveColor = Color3.White()
                wireframeShader.wireframe = true
            }
            mesh.material = wireframeShader
        } else {
            vd.colors = colors
        }
        vd.applyToMesh(mesh, true)
        this.mesh.setEnabled(true)
        this.isRendered = true
        this.mostRecentSimulationRendered = true
        if (logStats) {
            console.info(`${this.meshMethod} mesh took`, this.meshingDelta, "ms, sim took", this.simulationDelta, "ms. vs:", this.vertexCount().toLocaleString("en-us"))
        }
    }

    destroyMesh() {
        this.mesh.dispose()
        this.isRendered = false
    }

    reInitializeMesh() {
        this.mesh = new Mesh(this.id)
    }

    hideMesh() {
        this.isRendered = false
        this.mesh.setEnabled(false)
    }

    vertexCount() {
        return this.vertices.length / 3
    }

    faceCount() {
        return this.faces.length / 3
    }
}

const chunkkey = (x: number, z: number, size: number) => `${x}.${z}[${size}]`

const NULL_CHUNK_HANDLE = -1

const fastIntModulo = (dividend: number, divisor: number) => {
    return dividend - ~~(dividend / divisor) * divisor
}

const average = (nums: number[]) => {
    const count = nums.length
    const sum = nums.reduce((total, n) => total + n , 0)
    return sum / count
}

const roundDecimal = (num: number, decimals: number) => {
    const factor = 10 ** decimals
    return Math.round(num * factor) / factor
}

export class TerrainManager {
    minNodeSize: number
    chunkIndex: Map<string, number>
    recycledChunks: number[]
    rebuildChunks: number[]
    chunks: Chunk[]
    nearestChunkBoundaryX: number
    nearestChunkBoundaryZ: number
    heightMap: null | HeightMap
    
    private quadTree: Quadtree
    private recycleVec: Vec2

    constructor({
        heightMap = null as (HeightMap | null)
    } = {}) {
        this.minNodeSize = CHUNK_X_DIMENSION
        this.chunkIndex = new Map()
        this.nearestChunkBoundaryX = 0
        this.nearestChunkBoundaryZ = 0
        this.recycledChunks = []
        this.chunks = []
        this.rebuildChunks = []
        this.heightMap = heightMap
        this.quadTree = new Quadtree({
            min: new Vec2(0, 0),
            max: new Vec2(TERRAIN_MAX_X, TERRAIN_MAX_Z),
            minNodeSize: CHUNK_X_DIMENSION
        })
        this.recycleVec = Vec2.default()
    }

    private getRecyclableChunk() {
        if (this.recycledChunks.length < 1) {
            return NULL_CHUNK_HANDLE
        }
        return this.recycledChunks.pop()!
    }

    diffChunks(cameraX: number, cameraZ: number) {
        const quadTree = this.quadTree
        const camera = this.recycleVec.overwrite(cameraX, cameraZ)
        quadTree.insert(camera)
        const leafCount = quadTree.leafCount()

        const newIndex = new Map()
        for (let i = 0; i < leafCount; i++) {
            const {center, size} = quadTree.leaf(i)
            const key = chunkkey(center.x, center.z, size.x)
            newIndex.set(key, NULL_CHUNK_HANDLE)
        }

        const oldIndex = this.chunkIndex
        let chunksRecycled = 0
        for (const [oldKey, ref] of oldIndex.entries()) {
            if (!newIndex.has(oldKey)) {
                this.recycledChunks.push(ref)
                chunksRecycled++
            } else {
                newIndex.set(oldKey, ref)
            }
        }

        let chunkref = 0
        let chunksReused = 0
        for (let i = 0; i < leafCount; i++) {
            const {center, bounds, size} = quadTree.leaf(i)
            const key = chunkkey(center.x, center.z, size.x)
            if (oldIndex.has(key)) {
                continue
            }
            chunkref = this.getRecyclableChunk()
            if (chunkref !== NULL_CHUNK_HANDLE) {
                const chunk = this.chunks[chunkref]
                chunk.key = key
                chunk.bounds = bounds
                chunk.center = center
                chunk.dimensions = size
                chunk.levelOfDetail = lod(size.x)
                chunksReused++
            } else {
                chunkref = this.chunks.length
                const chunk = new Chunk({
                    center, bounds, dimensions: size,
                    levelOfDetail: lod(size.x),
                    key, 
                    id: "terrain-chunk-" + chunkref.toString()
                })
                this.chunks.push(chunk)
            }
            newIndex.set(key, chunkref)
            this.rebuildChunks.push(chunkref)
        }

        for (let i = 0; i < this.recycledChunks.length; i++) {
            const chunkref = this.recycledChunks[i]
            const chunk = this.chunks[chunkref]
            if (chunk.isRendered) {
                chunk.hideMesh()
            }
        } 
        this.chunkIndex = newIndex
    }

    hasTasks() {
        return this.rebuildChunks.length > 0
    }

    execPendingTask() {
        if (this.rebuildChunks.length < 1) {
            return false
        }
        const chunkref = this.rebuildChunks.pop()!
        const chunk = this.chunks[chunkref]
        if (this.heightMap) {
            chunk.heightMapSimulation(this.heightMap)
        } else {
            //chunk.simulate()
        }
        chunk.greedyMesh()
        chunk.render({wireframe: false, logStats: false})
        return true
    }

    isVoxelSolid(x: number, y: number, z: number) {
        return false
    }

    vertexCount() {
        return this.chunks.reduce((total, c) => {
            const count = c.isRendered ? c.vertexCount() : 0
            return total + count
        }, 0)
    }

    faceCount() {
        return this.chunks.reduce((total, c) => {
            const count = c.isRendered ? c.faceCount() : 0
            return total + count
        }, 0)
    }

    averageSimTime(decimals = 2) {
        const sim = this.chunks.map(({simulationDelta}) => simulationDelta)
        return roundDecimal(average(sim), decimals)
    }

    averageMeshTime(decimals = 2) {
        const mesh = this.chunks.map(({meshingDelta}) => meshingDelta)
        return roundDecimal(average(mesh), decimals)
    }

    averageSkirtTime(decimals = 2) {
        const mesh = this.chunks.map(({skirtDelta}) => skirtDelta)
        return roundDecimal(average(mesh), decimals)
    }

    chunkCount() {
        return this.quadTree.leafCount()
    }
}

export class HeightMap {
    height: number
    width: number
    data: number[]
    high: number
    
    constructor({
        height, width, high, data
    }: {
        height: number,
        width: number,
        high: number,
        data: number[],
    }) {
        this.height = height
        this.width = width
        this.data = data
        this.high = high
    }

    getHeight(x: number, y: number) {
        return this.data[this.height * y + x]
    }

    getHeightPercent(x: number, y: number) {
        return this.getHeight(x, y) / this.high
    }

    uniqueDataPoints() {
        return this.height * this.width
    }
}