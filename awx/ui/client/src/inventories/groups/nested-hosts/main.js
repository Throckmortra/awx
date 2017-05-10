/*************************************************
 * Copyright (c) 2017 Ansible, Inc.
 *
 * All Rights Reserved
 *************************************************/

import nestedHostsListDefinition from './nested-hosts.list';
import nestedHostsFormDefinition from './nested-hosts.form';
import controller from './nested-hosts-list.controller';

export default
    angular.module('nestedHosts', [])
    .value('NestedHostsListDefinition', nestedHostsListDefinition)
    .factory('NestedHostsFormDefinition', nestedHostsFormDefinition)
    .controller('NestedHostsListController', controller);
