pc.extend(pc.fw, function () {
    var REMOTE_CAMERA_NEAR_CLIP = 0.5;
    var REMOTE_CAMERA_FAR_CLIP = 2;

    /**
     * @name pc.fw.CameraComponentSystem
     * @class Used to add and remove {@link pc.fw.CameraComponent}s from Entities.
     * It also manages the currently active camera and controls the rendering part of the frame with beginFrame()/endFrame().
     * @constructor Create a new CameraComponentSystem
     * @param {Object} context
     * @extends pc.fw.ComponentSystem
     */
    var CameraComponentSystem = function (context) {
        this.id = 'camera';
        this.description = "Renders the scene from the location of the Entity.";
        context.systems.add(this.id, this);
        
        this.ComponentType = pc.fw.CameraComponent;
        this.DataType = pc.fw.CameraComponentData;

        this.schema = [{
            name: "clearColor",
            displayName: "Clear Color",
            description: "Clear Color",
            type: "rgba",
            defaultValue: [0.7294117647058823, 0.7294117647058823, 0.6941176470588235, 1.0]
        }, {
            name: "projection",
            displayName: "Projection",
            description: "Projection type of camera",
            type: "enumeration",
            options: {
                enumerations: [{
                    name: 'Perspective',
                    value: 0
                }, {
                    name: 'Orthographic',
                    value: 1
                }]
            },
            defaultValue: 0
        }, {
            name: "fov",
            displayName: "Field of View",
            description: "Field of view in Y axis",
            type: "number",
            defaultValue: 45,
            options: {
                min: 0,
                max: 90
            },
            filter: {
                projection: 0
            }
        }, {
            name: "orthoHeight",
            displayName: "Ortho Height",
            description: "View window half extent of camera in Y axis",
            type: "number",
            defaultValue: 100,
            filter: {
                projection: 1
            }
        }, {
            name: "nearClip",
            displayName: "Near Clip",
            description: "Near clipping distance",
            type: "number",
            defaultValue: 1,
            options: {
                min: 0
            }
        }, {
            name: "farClip",
            displayName: "Far Clip",
            description: "Far clipping distance",
            type: "number",
            defaultValue: 100000,
            options: {
                min: 0
            }
        }, {
            name: "activate",
            displayName: "Activate",
            description: "Activate camera when scene loads",
            type: "boolean",
            defaultValue: true            
        },{
            name: "camera",
            exposed: false
        }, {
            name: "aspectRatio",
            exposed: false
        }, {
            name: "model",
            exposed: false
        }, {
            name: "renderTarget",
            exposed: false
        }];

        this.exposeProperties();

        this._currentEntity = null;
        this._currentNode = null;

        this.on('remove', this.onRemove, this);
        pc.fw.ComponentSystem.on('toolsUpdate', this.toolsUpdate, this);

    };
    CameraComponentSystem = pc.inherits(CameraComponentSystem, pc.fw.ComponentSystem);
    
    /**
    * @property
    * @name pc.fw.CameraComponentSystem#current
    * @description Get or set the current camera. Use this property to set which Camera Entity is used to render the scene. This must be set to an Entity with a {@link pc.fw.CameraComponent}.
    * @type pc.fw.Entity 
    * @example 
    * var e = context.root.findByName('A Camera');
    * context.systems.camera.current = e;
    */
    Object.defineProperty(CameraComponentSystem.prototype, 'current', {
        get: function () {
            return this._currentEntity;
        },
        set: function (entity) {
            if (entity === null) {
                this._currentEntity = null;
                this._currentNode = null;
                return;
            }

            if (!entity.camera) {
                throw Error("Entity must have camera Component");
            }
            
            this._currentEntity = entity;
            this._currentNode = entity.camera.data.camera;
        }
    });

    pc.extend(CameraComponentSystem.prototype, {
        initializeComponentData: function (component, data, properties) {
            data = data || {};
            data.camera = new pc.scene.CameraNode();
            if (data.clearColor) {
                data.clearColor = new pc.Color(data.clearColor);    
            }
            
            
            if (this.context.designer && this.displayInTools(component.entity)) {
                var material = new pc.scene.BasicMaterial();
                material.color = pc.math.vec4.create(1, 1, 0, 1);
                material.update();

                var indexBuffer = new pc.gfx.IndexBuffer(this.context.graphicsDevice, pc.gfx.INDEXFORMAT_UINT8, 24);
                var indices = new Uint8Array(indexBuffer.lock());
                indices.set([0,1,1,2,2,3,3,0, // Near plane
                             4,5,5,6,6,7,7,4, // Far plane
                             0,4,1,5,2,6,3,7]); // Near to far edges
                indexBuffer.unlock();

                var format = new pc.gfx.VertexFormat(this.context.graphicsDevice, [
                    { semantic: pc.gfx.SEMANTIC_POSITION, components: 3, type: pc.gfx.ELEMENTTYPE_FLOAT32 }
                ]);

                var vertexBuffer = new pc.gfx.VertexBuffer(this.context.graphicsDevice, format, 8, pc.gfx.BUFFER_DYNAMIC);

                var mesh = new pc.scene.Mesh();
                mesh.vertexBuffer = vertexBuffer;
                mesh.indexBuffer[0] = indexBuffer;
                mesh.primitive[0].type = pc.gfx.PRIMITIVE_LINES;
                mesh.primitive[0].base = 0;
                mesh.primitive[0].count = indexBuffer.getNumIndices();
                mesh.primitive[0].indexed = true;

                var model = new pc.scene.Model();
                model.graph = data.camera;
                model.meshInstances = [ new pc.scene.MeshInstance(model.graph, mesh, material) ];

                this.context.scene.addModel(model);

                data.model = model;
            }

            properties = ['model', 'camera', 'aspectRatio', 'renderTarget', 'clearColor', 'fov', 'orthoHeight', 'activate', 'nearClip', 'farClip', 'projection'];
    
            CameraComponentSystem._super.initializeComponentData.call(this, component, data, properties);

            if (!window.pc.apps.designer && component.activate && !component.entity.hasLabel("pc:designer")) {
                this.current = component.entity;
            }
        },
        
        /**
         * Start rendering the frame for the current camera
         * @function
         * @name pc.fw.CameraComponentSystem#frameBegin
         */
        frameBegin: function () {
            var camera = this._currentNode;
            if (!camera) {
                return;
            }

            var device = this.context.graphicsDevice;
            var aspect = device.width / device.height;
            if (aspect !== camera.getAspectRatio()) {
                camera.setAspectRatio(aspect);
            }
        },

        /**
         * End rendering the frame for the current camera
         * @function
         * @name pc.fw.CameraComponentSystem#frameEnd
         */
        frameEnd: function () {
        },

        onRemove: function (entity, data) {
            // If this is the current camera then clear it
            if (this._currentEntity === entity) {
                this.current = null;
            }

            if (this.context.designer && this.displayInTools(entity)) {
                if (this.context.scene.containsModel(data.model)) {
                    this.context.scene.removeModel(data.model);
                }
            }

            entity.removeChild(data.camera);
            data.camera = null;
        },
    
        toolsUpdate: function (fn) {
            var components = this.store;
            for (var id in components) {
                if (components.hasOwnProperty(id)) {
                    var entity = components[id].entity;
                    var data = components[id].data;

                    if (this.displayInTools(entity)) {
                        this._updateGfx(entity.camera);
                    }
                }
            }
        },

        _updateGfx: function (component) {
            if (component.model && component.model.meshInstances.length) {
                var vertexBuffer = component.model.meshInstances[0].mesh.vertexBuffer;

                // Retrieve the characteristics of the camera frustum
                var aspectRatio = component.camera.getAspectRatio();
                var nearClip    = this.isToolsCamera(component.entity) ? REMOTE_CAMERA_NEAR_CLIP : component.nearClip; // Remote User cameras don't display full extents
                var farClip     = this.isToolsCamera(component.entity) ? REMOTE_CAMERA_FAR_CLIP : component.farClip; // Remote User cameras don't display full extents
                var fov         = component.fov * Math.PI / 180.0;
                var projection  = component.projection;

                var x, y;
                if (projection === pc.scene.Projection.PERSPECTIVE) {
                    y = Math.tan(fov / 2.0) * nearClip;
                } else {
                    y = component.camera.getOrthoHeight();
                }
                x = y * aspectRatio;

                var positions = new Float32Array(vertexBuffer.lock());
                positions[0]  = x;
                positions[1]  = -y;
                positions[2]  = -nearClip;
                positions[3]  = x;
                positions[4]  = y;
                positions[5]  = -nearClip;
                positions[6]  = -x;
                positions[7]  = y;
                positions[8]  = -nearClip;
                positions[9]  = -x;
                positions[10] = -y;
                positions[11] = -nearClip;

                if (projection === pc.scene.Projection.PERSPECTIVE) {
                    y = Math.tan(fov / 2.0) * farClip;
                    x = y * aspectRatio;
                }
                positions[12] = x;
                positions[13] = -y;
                positions[14] = -farClip;
                positions[15] = x;
                positions[16] = y;
                positions[17] = -farClip;
                positions[18] = -x;
                positions[19] = y;
                positions[20] = -farClip;
                positions[21] = -x;
                positions[22] = -y;
                positions[23] = -farClip;                
                vertexBuffer.unlock();
            }
        },

        isToolsCamera: function (entity) {
            return entity.hasLabel("pc:designer");
        },

        displayInTools: function (entity) {
            return (!this.isToolsCamera(entity) || (entity.getName() === "Perspective"));
        } 
    });

    return {
        CameraComponentSystem: CameraComponentSystem
    };
}());