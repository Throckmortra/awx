import { N_ } from '../../../i18n';

export default {
    name: "inventories.edit.groups.edit.nested_hosts.add",
    url: "/add",
    ncyBreadcrumb: {
        parent: "inventories.edit.groups.edit.nested_hosts",
        label: N_("CREATE HOST")
    },
    views: {
        'hostForm@inventories': {
            templateProvider: function(GenerateForm, RelatedHostsFormDefinition) {
                let form = RelatedHostsFormDefinition;
                return GenerateForm.buildHTML(form, {
                    mode: 'add',
                    related: false
                });
            },
            controller: 'RelatedHostAddController'
        }
    }
};
