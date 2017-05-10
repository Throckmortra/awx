import {templateUrl} from '../../shared/template-url/template-url.factory';
import { N_ } from '../../i18n';

export default {
    url: '/ansible_facts',
    ncyBreadcrumb: {
        label: N_("FACTS")
    },
    views: {
        'related': {
            controller: 'AnsibleFactsController',
            templateUrl: templateUrl('inventories/ansible_facts/ansible_facts')
        }
    },
    resolve: {
        Facts: ['$stateParams', 'GetBasePath', 'Rest',
            function($stateParams, GetBasePath, Rest) {
                let ansibleFactsUrl = GetBasePath('hosts') + $stateParams.host_id + '/ansible_facts';
                Rest.setUrl(ansibleFactsUrl);
                return Rest.get()
                    .success(function(data) {
                        return data;
                    });
            }
        ]
    }
};
