const {CompositeDisposable, Disposable, Emitter} = require('via');
const etch = require('etch');
const $ = etch.dom;

module.exports = class AlertsStatusView {
    constructor({manager, status}){
        this.manager = manager;
        this.status = status;
        this.disposables = new CompositeDisposable();
        this.message = null;
        this.timeout = null;

        etch.initialize(this);

        this.statusBarTile = this.status.addRightTile({item: this});

        this.disposables.add(this.manager.onDidCreateAlert(this.update.bind(this)));
        this.disposables.add(this.manager.onDidUpdateAlert(this.update.bind(this)));
        this.disposables.add(this.manager.onDidTriggerAlert(this.update.bind(this)));
        this.disposables.add(this.manager.onDidDestroyAlert(this.update.bind(this)));
    }

    render(){
        return $.div({classList: `alerts-status toolbar-button`, onClick: this.open},
            $.div({class: 'alerts-status-icon'}),
            $.div({classList: 'alerts-status-message'}, this.manager.open().length)
        );
    }

    open(){
        via.workspace.getElement().dispatchEvent(new CustomEvent('alerts:open-manager', {bubbles: true, cancelable: true}));
    }

    update(){
        etch.update(this);
    }

    destroy(){
        this.statusBarTile.destroy();
        this.disposables.dispose();
    }
}