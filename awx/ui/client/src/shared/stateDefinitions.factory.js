/**
 * @ngdoc interface
 * @name stateDefinitions
 * @description An API for generating a standard set of state definitions
 * generateTree - builds a full list/form tree
 * generateListNode - builds a single list node e.g. {name: 'projects', ...}
 * generateFormNode - builds a form node definition e.g. {name: 'projects.add', ...}
 * generateFormListDefinitions - builds form list definitions attached to a form node e.g. {name: 'projects.edit.permissions', ...}
 * generateLookupNodes - Attaches to a form node. Builds an abstract '*.lookup' node with field-specific 'lookup.*' children e.g. {name: 'projects.add.lookup.organizations', ...}
 */

export default ['$injector', '$stateExtender', '$log', 'i18n', function($injector, $stateExtender, $log, i18n) {
    return {
        /**
        * @ngdoc method
        * @name stateDefinitions.generateTree
        * @description intended for consumption by $stateProvider.state.lazyLoad in a placeholder node
        * @param {object} params
            {
                parent: 'stateName', // the name of the top-most node of this tree
                modes: ['add', 'edit'], // form modes to include in this state tree
                list: 'InjectableListDefinition',
                form: 'InjectableFormDefinition',
                controllers: {
                    list: 'Injectable' || Object,
                    add:  'Injectable' || Object,
                    edit: 'Injectable' || Object,
            }
        * @returns {object} Promise which resolves to an object.state containing array of all state definitions in this tree
        * e.g. {state: [{...}, {...}, ...]}
        */
        generateTree: function(params) {
            let form, list, formStates, listState,
                states = [];
            //return defer.promise;
            return new Promise((resolve) => {
                // returns array of the following states:
                // resource.add, resource.edit
                // resource.add.lookup, resource.add.lookup.*  => [field in form.fields if field.type == 'lookup']
                // resource.edit.lookup, resource.edit.lookup.* => [field in form.fields if field.type == 'lookup']
                // resource.edit.* => [relationship in form.related]
                if (params.list) {
                    list = $injector.get(params.list);

                    listState = this.generateListNode(list, params);
                    states.push(listState);
                }
                if (params.form) {
                    // handle inconsistent typing of form definitions
                    // can be either an object or fn
                    form = $injector.get(params.form);
                    form = typeof(form) === 'function' ? form() : form;

                    formStates = _.map(params.modes, (mode) => this.generateFormNode(mode, form, params));
                    states = states.concat(_.flatten(formStates));
                }

                $log.debug('*** Generated State Tree', states);
                resolve({ states: states });
            });
        },

        /**
         * @ngdoc method
         * @name stateDefinitions.generateListNode
         * @description builds single list node
         * @params {object} list - list definition/configuration object
         * @params {object} params
         * @returns {object} a list state definition
         */
        generateListNode: function(list, params) {
            let state,
                url = params.urls && params.urls.list ? params.urls.list : (params.url ? params.url : `/${list.name}`);

            // allows passed-in params to specify a custom templateUrl
            // otherwise, use html returned by generateList.build() to fulfill templateProvider fn
            function generateTemplateBlock() {
                if (params.templates && params.templates.list) {
                    return params.templates.list;
                } else {
                    return function(ListDefinition, generateList) {
                        let html = generateList.build({
                            list: ListDefinition,
                            mode: 'edit'
                        });
                        html = generateList.wrapPanel(html);
                        // generateList.formView() inserts a ui-view="form" inside the list view's hierarchy
                        return generateList.insertFormView() + html;
                    };
                }
            }
            state = $stateExtender.buildDefinition({
                searchPrefix: list.iterator,
                name: params.parent,
                url: url,
                data: params.data,
                ncyBreadcrumb: {
                    label: list.title
                },
                resolve: {
                    Dataset: [params.list, 'QuerySet', '$stateParams', 'GetBasePath',
                        function(list, qs, $stateParams, GetBasePath) {
                            let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                            return qs.search(path, $stateParams[`${list.iterator}_search`]);
                        }
                    ],
                    ListDefinition: () => list
                },
                views: {
                    '@': {
                        // resolves to a variable property name:
                        // 'templateUrl' OR 'templateProvider'
                        [params.templates && params.templates.list ? 'templateUrl' : 'templateProvider']: generateTemplateBlock(),
                        controller: params.controllers.list,
                    }
                }
            });
            // allow passed-in params to override default resolve block
            if (params.resolve && params.resolve.list) {
                state.resolve = _.merge(state.resolve, params.resolve.list);
            }
            // allow passed-in params to override default ncyBreadcrumb property
            if (params.ncyBreadcrumb) {
                state.ncyBreadcrumb = params.ncyBreadcrumb;
            }
            if (list.search) {
                state.params[`${list.iterator}_search`].value = _.merge(state.params[`${list.iterator}_search`].value, list.search);
            }
            return state;
        },
        /**
         * @ngdoc method
         * @name stateDefinitions.generateFormNode
         * @description builds a node of form states, e.g. resource.edit.** or resource.add.**
         * @param {string} mode - 'add' || 'edit' - the form mode of this node
         * @param {object} form - form definition/configuration object
         * @returns {array} Array of state definitions required by form mode [{...}, {...}, ...]
         */
        generateFormNode: function(mode, form, params) {
            let formNode,
                states = [],
                url;
            switch (mode) {
                case 'add':
                    url = params.urls && params.urls.add ? params.urls.add : (params.url ? params.url : '/add');
                    // breadcrumbName necessary for resources that are more than one word like
                    // job templates.  form.name can't have spaces in it or it busts form gen
                    formNode = $stateExtender.buildDefinition({
                        name: params.name || `${params.parent}.add`,
                        url: url,
                        ncyBreadcrumb: {
                            [params.parent ? 'parent' : null]: `${params.parent}`,
                            label: i18n.sprintf(i18n._("CREATE %s"), i18n._(`${form.breadcrumbName || form.name}`))
                        },
                        views: {
                            'form': {
                                templateProvider: function(FormDefinition, GenerateForm) {
                                    let form = typeof(FormDefinition) === 'function' ?
                                        FormDefinition() : FormDefinition;
                                    return GenerateForm.buildHTML(form, {
                                        mode: 'add',
                                        related: false
                                    });
                                },
                                controller: params.controllers.add
                            }
                        },
                        resolve: {
                            'FormDefinition': [params.form, function(definition) {
                                return definition;
                            }]
                        }
                    });
                    if (params.resolve && params.resolve.add) {
                        formNode.resolve = _.merge(formNode.resolve, params.resolve.add);
                    }
                    break;
                case 'edit':
                    url = params.urls && params.urls.edit ? params.urls.edit : (params.url ? params.url : `/:${form.name}_id`);
                    let formNodeState = {
                        name: params.name || `${params.parent}.edit`,
                        url: url,
                        ncyBreadcrumb: {
                            [params.parent ? 'parent' : null]: `${params.parent}`,
                            label: '{{parentObject.name || name}}'
                        },
                        views: {
                            'form': {
                                templateProvider: function(FormDefinition, GenerateForm) {
                                    let form = typeof(FormDefinition) === 'function' ?
                                        FormDefinition() : FormDefinition;
                                    return GenerateForm.buildHTML(form, {
                                        mode: 'edit'
                                    });
                                },
                                controller: params.controllers.edit
                            }
                        },
                        resolve: {
                            FormDefinition: [params.form, function(definition) {
                                return definition;
                            }],
                            resourceData: ['FormDefinition', 'Rest', '$stateParams', 'GetBasePath',
                                function(FormDefinition, Rest, $stateParams, GetBasePath) {
                                    let form, path;
                                    form = typeof(FormDefinition) === 'function' ?
                                        FormDefinition() : FormDefinition;
                                    if (GetBasePath(form.basePath) === undefined && GetBasePath(form.stateTree) === undefined ){
                                        throw { name: 'NotImplementedError', message: `${form.name} form definition is missing basePath or stateTree property.` };
                                    }
                                    else{
                                        path = (GetBasePath(form.basePath) || GetBasePath(form.stateTree) || form.basePath) + $stateParams[`${form.name}_id`];
                                    }
                                    Rest.setUrl(path);
                                    return Rest.get();
                                }
                            ]
                        },
                    };
                    if (params.data && params.data.activityStreamTarget) {
                        formNodeState.data = {};
                        formNodeState.data.activityStreamId = params.data.activityStreamId ? params.data.activityStreamId : params.data.activityStreamTarget + '_id';
                        formNodeState.data.activityStreamTarget = params.data.activityStreamTarget;
                    }
                    formNode = $stateExtender.buildDefinition(formNodeState);

                    if (params.resolve && params.resolve.edit) {
                        formNode.resolve = _.merge(formNode.resolve, params.resolve.edit);
                    }
                    break;
            }
            states.push(formNode);
            states = states.concat(this.generateLookupNodes(form, formNode)).concat(this.generateFormListDefinitions(form, formNode));
            return states;
        },
        /**
         * @ngdoc method
         * @name stateDefinitions.generateFormListDefinitions
         * @description builds state definitions for a form's related lists, like notifications/permissions
         * @param {object} form - form definition/configuration object
         * @params {object} formStateDefinition - the parent form node
         * @returns {array} Array of state definitions [{...}, {...}, ...]
         */
        generateFormListDefinitions: function(form, formStateDefinition) {

            function buildRbacUserTeamDirective(){
                let states = [];

                states.push($stateExtender.buildDefinition({
                    name: `${formStateDefinition.name}.permissions.add`,
                    squashSearchUrl: true,
                    url: '/add-permissions',
                    params: {
                        project_search: {
                            value: {order_by: 'name', page_size: '5', role_level: 'admin_role'},
                            dynamic: true
                        },
                        job_template_search: {
                            value: {order_by: 'name', page_size: '5', role_level: 'admin_role'},
                            dynamic: true
                        },
                        workflow_template_search: {
                            value: {order_by: 'name', page_size: '5', role_level: 'admin_role'},
                            dynamic: true
                        },
                        inventory_search: {
                            value: {order_by: 'name', page_size: '5', role_level: 'admin_role'},
                            dynamic: true
                        },
                        credential_search: {
                            value: {order_by: 'name', page_size: '5', role_level: 'admin_role'},
                            dynamic: true
                        }
                    },
                    views: {
                        [`modal@${formStateDefinition.name}`]: {
                            template: `<add-rbac-user-team resolve="$resolve" title="` + i18n._('Add Permissions') + `"></add-rbac-user-team>`
                        }
                    },
                    resolve: {
                        jobTemplatesDataset: ['QuerySet', '$stateParams', 'GetBasePath',
                            function(qs, $stateParams, GetBasePath) {
                                let path = GetBasePath('job_templates');
                                return qs.search(path, $stateParams.job_template_search);
                            }
                        ],
                        workflowTemplatesDataset: ['QuerySet', '$stateParams', 'GetBasePath',
                            function(qs, $stateParams, GetBasePath) {
                                let path = GetBasePath('workflow_job_templates');
                                return qs.search(path, $stateParams.workflow_template_search);
                            }
                        ],
                        projectsDataset: ['ProjectList', 'QuerySet', '$stateParams', 'GetBasePath',
                            function(list, qs, $stateParams, GetBasePath) {
                                let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                                return qs.search(path, $stateParams[`${list.iterator}_search`]);
                            }
                        ],
                        inventoriesDataset: ['InventoryList', 'QuerySet', '$stateParams', 'GetBasePath',
                            function(list, qs, $stateParams, GetBasePath) {
                                let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                                return qs.search(path, $stateParams[`${list.iterator}_search`]);
                            }
                        ],
                        credentialsDataset: ['CredentialList', 'QuerySet', '$stateParams', 'GetBasePath',
                            function(list, qs, $stateParams, GetBasePath) {
                                let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                                return qs.search(path, $stateParams[`${list.iterator}_search`]);
                            }
                        ],
                    },
                    onExit: function($state) {
                        if ($state.transition) {
                            $('#add-permissions-modal').modal('hide');
                            $('.modal-backdrop').remove();
                            $('body').removeClass('modal-open');
                        }
                    },
                }));
                return states;
            }

            function buildRbacResourceDirective() {
                let states = [];

                states.push($stateExtender.buildDefinition({
                    name: `${formStateDefinition.name}.permissions.add`,
                    squashSearchUrl: true,
                    url: '/add-permissions',
                    params: {
                        user_search: {
                            value: { order_by: 'username', page_size: '5' },
                            dynamic: true,
                        },
                        team_search: {
                            value: { order_by: 'name', page_size: '5' },
                            dynamic: true
                        }
                    },
                    views: {
                        [`modal@${formStateDefinition.name}`]: {
                            template: `<add-rbac-resource users-dataset="$resolve.usersDataset" teams-dataset="$resolve.teamsDataset" selected="allSelected" resource-data="$resolve.resourceData" title="` + i18n._('Add Users') + ' / ' + i18n._('Teams') + `"></add-rbac-resource>`
                        }
                    },
                    resolve: {
                        usersDataset: ['addPermissionsUsersList', 'QuerySet', '$stateParams', 'GetBasePath',
                            function(list, qs, $stateParams, GetBasePath) {
                                let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                                return qs.search(path, $stateParams.user_search);

                            }
                        ],
                        teamsDataset: ['addPermissionsTeamsList', 'QuerySet', '$stateParams', 'GetBasePath',
                            function(list, qs, $stateParams, GetBasePath) {
                                let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                                return qs.search(path, $stateParams.team_search);
                            }
                        ]
                    },
                    onExit: function($state) {
                        if ($state.transition) {
                            $('#add-permissions-modal').modal('hide');
                            $('.modal-backdrop').remove();
                            $('body').removeClass('modal-open');
                        }
                    },
                }));
                return states;
            }

            function buildNotificationState(field) {
                let state,
                    list = field.include ? $injector.get(field.include) : field;
                state = $stateExtender.buildDefinition({
                    searchPrefix: `${list.iterator}`,
                    name: `${formStateDefinition.name}.${list.iterator}s`,
                    url: `/${list.iterator}s`,
                    ncyBreadcrumb: {
                        parent: `${formStateDefinition.name}`,
                        label: `${field.iterator}s`
                    },
                    params: {
                        [list.iterator + '_search']: {
                            value: { order_by: field.order_by ? field.order_by : 'name' }
                        }
                    },
                    views: {
                        'related': {
                            templateProvider: function(FormDefinition, GenerateForm) {
                                let html = GenerateForm.buildCollection({
                                    mode: 'edit',
                                    related: `${list.iterator}s`,
                                    form: typeof(FormDefinition) === 'function' ?
                                        FormDefinition() : FormDefinition
                                });
                                return html;
                            },
                            controller: ['$scope', 'ListDefinition', 'Dataset', 'ToggleNotification', 'NotificationsListInit', 'GetBasePath', '$stateParams', 'inventorySourceData',
                                function($scope, list, Dataset, ToggleNotification, NotificationsListInit, GetBasePath, $stateParams, inventorySourceData) {
                                    var url , params = $stateParams, id;
                                    if(params.hasOwnProperty('project_id')){
                                        id = params.project_id;
                                        url = GetBasePath('projects');
                                    }
                                    if(params.hasOwnProperty('job_template_id')){
                                        id = params.job_template_id;
                                        url = GetBasePath('job_templates');
                                    }
                                    if(params.hasOwnProperty('workflow_job_template_id')){
                                        id = params.workflow_job_template_id;
                                        url = GetBasePath('workflow_job_templates');
                                    }
                                    if(params.hasOwnProperty('inventory_id')){
                                        id = inventorySourceData.id;
                                        url = GetBasePath('inventory_sources');
                                    }
                                    if(params.hasOwnProperty('organization_id')){
                                        id = params.organization_id;
                                        url = GetBasePath('organizations');
                                    }
                                    function init() {
                                        $scope.list = list;
                                        $scope[`${list.iterator}_dataset`] = Dataset.data;
                                        $scope[list.name] = $scope[`${list.iterator}_dataset`].results;


                                        NotificationsListInit({
                                            scope: $scope,
                                            url: url,
                                            id: id
                                        });

                                        $scope.$watch(`${list.iterator}_dataset`, function() {
                                            // The list data has changed and we need to update which notifications are on/off
                                            $scope.$emit('relatednotifications');
                                        });
                                    }

                                    $scope.toggleNotification = function(event, notifier_id, column) {
                                        var notifier = this.notification;
                                        try {
                                            $(event.target).tooltip('hide');
                                        }
                                        catch(e) {
                                            // ignore
                                        }
                                        ToggleNotification({
                                            scope: $scope,
                                            url: url + id,
                                            notifier: notifier,
                                            column: column,
                                            callback: 'NotificationRefresh'
                                        });
                                    };

                                    init();

                                }
                            ]
                        }
                    },
                    resolve: {
                        ListDefinition: () => {
                            return list;
                        },
                        inventorySourceData: ['$stateParams', 'GroupManageService', function($stateParams, GroupManageService) {
                            if($stateParams.hasOwnProperty('group_id')){
                                return GroupManageService.getInventorySource({ group: $stateParams.group_id }).then(res => res.data.results[0]);
                            }
                            else{
                                return null;
                            }
                        }],
                        Dataset: ['ListDefinition', 'QuerySet', '$stateParams', 'GetBasePath', '$interpolate', '$rootScope',
                            (list, qs, $stateParams, GetBasePath, $interpolate, $rootScope) => {
                                // allow related list definitions to use interpolated $rootScope / $stateParams in basePath field
                                let path, interpolator;
                                if (GetBasePath(list.basePath)) {
                                    path = GetBasePath(list.basePath);
                                } else {
                                    interpolator = $interpolate(list.basePath);
                                    path = interpolator({ $rootScope: $rootScope, $stateParams: $stateParams });
                                }
                                return qs.search(path, $stateParams[`${list.iterator}_search`]);
                            }
                        ]
                    }
                });
                // // appy any default search parameters in form definition
                // if (field.search) {
                //     state.params[`${field.iterator}_search`].value = _.merge(state.params[`${field.iterator}_search`].value, field.search);
                // }
                return state;
            }

            function buildRbacUserDirective() {
                let states = [];

                states.push($stateExtender.buildDefinition({
                    name: `${formStateDefinition.name}.users.add`,
                    squashSearchUrl: true,
                    url: '/add-user',
                    params: {
                        user_search: {
                            value: { order_by: 'username', page_size: '5' },
                            dynamic: true,
                        }
                    },
                    views: {
                        [`modal@${formStateDefinition.name}`]: {
                            template: `<add-rbac-resource users-dataset="$resolve.usersDataset" selected="allSelected" resource-data="$resolve.resourceData" without-team-permissions="true" title="` + i18n._('Add Users') + `"></add-rbac-resource>`
                        }
                    },
                    resolve: {
                        usersDataset: ['addPermissionsUsersList', 'QuerySet', '$stateParams', 'GetBasePath',
                            function(list, qs, $stateParams, GetBasePath) {
                                let path = GetBasePath(list.basePath) || GetBasePath(list.name);
                                return qs.search(path, $stateParams.user_search);

                            }
                        ]
                    },
                    onExit: function($state) {
                        if ($state.transition) {
                            $('#add-permissions-modal').modal('hide');
                            $('.modal-backdrop').remove();
                            $('body').removeClass('modal-open');
                        }
                    },
                }));
                return states;
            }

            function buildListNodes(field) {
                let states = [];
                if(field.iterator === 'notification'){
                    states.push(buildNotificationState(field));
                    states = _.flatten(states);
                }
                else{
                    states.push(buildListDefinition(field));
                    if (field.iterator === 'permission' && field.actions && field.actions.add) {
                        if (form.name === 'user' || form.name === 'team'){
                            states.push(buildRbacUserTeamDirective());
                        }
                        else {
                            states.push(buildRbacResourceDirective());
                        }
                    }
                    else if (field.iterator === 'user' && field.actions && field.actions.add) {
                        if(form.name === 'team') {
                            states.push(buildRbacUserDirective());
                        }
                    }
                }
                states = _.flatten(states);
                return states;
            }

            function buildListDefinition(field) {
                let state,
                    list = field.include ? $injector.get(field.include) : field;
                state = $stateExtender.buildDefinition({
                    searchPrefix: `${list.iterator}`,
                    name: `${formStateDefinition.name}.${list.iterator}s`,
                    url: `/${list.iterator}s`,
                    ncyBreadcrumb: {
                        parent: `${formStateDefinition.name}`,
                        label: `${field.iterator}s`
                    },
                    params: {
                        [list.iterator + '_search']: {
                            value: { order_by: field.order_by ? field.order_by : 'name' }
                        },
                    },
                    views: {
                        'related': {
                            templateProvider: function(FormDefinition, GenerateForm) {
                                let html = GenerateForm.buildCollection({
                                    mode: 'edit',
                                    related: `${list.iterator}s`,
                                    form: typeof(FormDefinition) === 'function' ?
                                        FormDefinition() : FormDefinition
                                });
                                return html;
                            },
                            controller: ['$scope', 'ListDefinition', 'Dataset',
                                function($scope, list, Dataset) {
                                    $scope.list = list;
                                    $scope[`${list.iterator}_dataset`] = Dataset.data;
                                    $scope[`${list.iterator}s`] = $scope[`${list.iterator}_dataset`].results;
                                }
                            ]
                        }
                    },
                    resolve: {
                        ListDefinition: () => {
                            return list;
                        },
                        Dataset: ['ListDefinition', 'QuerySet', '$stateParams', 'GetBasePath', '$interpolate', '$rootScope',
                            (list, qs, $stateParams, GetBasePath, $interpolate, $rootScope) => {
                                // allow related list definitions to use interpolated $rootScope / $stateParams in basePath field
                                let path, interpolator;
                                if (GetBasePath(list.basePath)) {
                                    path = GetBasePath(list.basePath);
                                } else {
                                    interpolator = $interpolate(list.basePath);
                                    path = interpolator({ $rootScope: $rootScope, $stateParams: $stateParams });
                                }
                                return qs.search(path, $stateParams[`${list.iterator}_search`]);
                            }
                        ]
                    }
                });
                // appy any default search parameters in form definition
                if (field.search) {
                    state.params[`${field.iterator}_search`].value = _.merge(state.params[`${field.iterator}_search`].value, field.search);
                }
                return state;
            }
            return _(form.related).map(buildListNodes).flatten().value();
        },
        /**
         * @ngdoc method
         * @name stateDefinitions.generateLookupNode
         * @description builds a node of child states for each lookup field in a form
         * @param {object} form - form definition/configuration object
         * @params {object} formStateDefinition - the parent form node
         * @returns {array} Array of state definitions [{...}, {...}, ...]
         */
        generateLookupNodes: function(form, formStateDefinition) {

            function buildFieldDefinition(field) {
                let state = $stateExtender.buildDefinition({
                    searchPrefix: field.sourceModel,
                    //squashSearchUrl: true, @issue enable
                    name: `${formStateDefinition.name}.${field.sourceModel}`,
                    url: `/${field.sourceModel}?selected`,
                    // a lookup field's basePath takes precedence over generic list definition's basePath, if supplied
                    data: {
                        basePath: field.basePath || null,
                        formChildState: true
                    },
                    params: {
                        [field.sourceModel + '_search']: {
                            value: {
                                page_size: '5',
                                role_level: 'use_role'
                            }
                        }
                    },
                    ncyBreadcrumb: {
                        skip: true
                    },
                    views: {
                        'modal': {
                            templateProvider: function(ListDefinition, generateList) {
                                let list_html = generateList.build({
                                    mode: 'lookup',
                                    list: ListDefinition,
                                    input_type: 'radio'
                                });
                                return `<lookup-modal>${list_html}</lookup-modal>`;

                            }
                        }
                    },
                    resolve: {
                        ListDefinition: [field.list, function(list) {
                            list.iterator = field.sourceModel;
                            return list;
                        }],
                        Dataset: ['ListDefinition', 'QuerySet', '$stateParams', 'GetBasePath', '$interpolate', '$rootScope', '$state',
                            (list, qs, $stateParams, GetBasePath, $interpolate, $rootScope, $state) => {
                                // allow lookup field definitions to use interpolated $stateParams / $rootScope in basePath field
                                // the basePath on a form's lookup field will take precedence over the general model list's basepath
                                let path, interpolator;
                                if ($state.transition._targetState._definition.data && GetBasePath($state.transition._targetState._definition.data.basePath)) {
                                    path = GetBasePath($state.transition._targetState._definition.data.basePath);
                                } else if ($state.transition._targetState._definition.data && $state.transition._targetState._definition.data.basePath) {
                                    interpolator = $interpolate($state.transition._targetState._definition.data.basePath);
                                    path = interpolator({ $rootScope: $rootScope, $stateParams: $stateParams });
                                } else if (GetBasePath(list.basePath)) {
                                    path = GetBasePath(list.basePath);
                                } else {
                                    interpolator = $interpolate(list.basePath);
                                    path = interpolator({ $rootScope: $rootScope, $stateParams: $stateParams });
                                }
                                // Need to change the role_level here b/c organizations and inventory scripts
                                // don't have a "use_role", only "admin_role" and "read_role"
                                if(list.iterator === "organization" || list.iterator === "inventory_script"){
                                    $stateParams[`${list.iterator}_search`].role_level = "admin_role";
                                }
                                return qs.search(path, $stateParams[`${list.iterator}_search`]);
                            }
                        ]
                    },
                    onExit: function($state) {
                        if ($state.transition) {
                            $('#form-modal').modal('hide');
                            $('.modal-backdrop').remove();
                            $('body').removeClass('modal-open');
                        }
                    },
                });
                if (field.search) {
                    state.params[`${field.sourceModel}_search`].value = _.merge(state.params[`${field.sourceModel}_search`].value, field.search);
                }
                return state;
            }
            return _(form.fields).filter({ type: 'lookup' }).map(buildFieldDefinition).value();
        }

    };

}];
